import type { PoolClient } from "pg";

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
}

export async function checkAndIncrementSendQuota(
  client: PoolClient,
  merchantId: string,
  defaultMerchantCap = 500,
  defaultPlatformCap = 100000
): Promise<RateLimitResult> {
  await client.query(
    `INSERT INTO merchant_send_quotas (merchant_id, daily_cap, sent_today, quota_date)
     VALUES ($1, $2, 0, CURRENT_DATE)
     ON CONFLICT (merchant_id) DO NOTHING`,
    [merchantId, defaultMerchantCap]
  );

  await client.query(
    `UPDATE merchant_send_quotas SET
       sent_today = CASE WHEN quota_date = CURRENT_DATE THEN sent_today ELSE 0 END,
       quota_date = CURRENT_DATE
     WHERE merchant_id = $1`,
    [merchantId]
  );

  const merchantQuota = await client.query<{ sent_today: number; daily_cap: number }>(
    `UPDATE merchant_send_quotas SET sent_today = sent_today + 1, updated_at = NOW()
     WHERE merchant_id = $1 AND sent_today < daily_cap AND quota_date = CURRENT_DATE
     RETURNING sent_today, daily_cap`,
    [merchantId]
  );

  if (!merchantQuota.rowCount) {
    return { allowed: false, reason: "Merchant daily send cap reached" };
  }

  await client.query(
    `UPDATE platform_send_quota SET
       sent_today = CASE WHEN quota_date = CURRENT_DATE THEN sent_today ELSE 0 END,
       quota_date = CURRENT_DATE
     WHERE id = 1`
  );

  const platformQuota = await client.query(
    `UPDATE platform_send_quota SET sent_today = sent_today + 1, updated_at = NOW()
     WHERE id = 1 AND sent_today < daily_cap AND quota_date = CURRENT_DATE
     RETURNING sent_today, daily_cap`,
    []
  );

  if (!platformQuota.rowCount) {
    await client.query(
      `UPDATE merchant_send_quotas SET sent_today = GREATEST(sent_today - 1, 0) WHERE merchant_id = $1`,
      [merchantId]
    );
    return { allowed: false, reason: "Platform daily send cap reached" };
  }

  void defaultPlatformCap;
  return { allowed: true };
}
