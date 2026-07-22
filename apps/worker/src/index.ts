import dotenv from "dotenv";
import { lifecycleBullJobId } from "@custva/shared";
import { Queue, Worker, type JobsOptions } from "bullmq";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { WhatsAppCloudApiAdapter } from "@custva/whatsapp-adapters";

const isProd = process.env.NODE_ENV === "production";

dotenv.config({ path: "../../.env" });
dotenv.config({ path: "../../.env.local" });
if (!isProd) {
  dotenv.config({ path: "../../.env.example" });
}

const redisConnection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379"
};
const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
if (!process.env.REDIS_URL && isProd) {
  throw new Error("REDIS_URL is required in production");
}

const MERCHANT_DAILY_CAP = Number(process.env.WA_MERCHANT_DAILY_CAP ?? 500);
const PLATFORM_DAILY_CAP = Number(process.env.WA_PLATFORM_DAILY_CAP ?? 100000);

const waAdapter =
  process.env.WA_PHONE_NUMBER_ID && process.env.WA_ACCESS_TOKEN
    ? new WhatsAppCloudApiAdapter({
        phoneNumberId: process.env.WA_PHONE_NUMBER_ID,
        accessToken: process.env.WA_ACCESS_TOKEN
      })
    : null;

if (isProd && !waAdapter) {
  throw new Error(
    "WA_PHONE_NUMBER_ID and WA_ACCESS_TOKEN are required in production (refusing silent mock mode)"
  );
}

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  removeOnComplete: 500,
  removeOnFail: 1000,
  backoff: { type: "exponential", delay: 2000 }
};

export const campaignDispatchQueue = new Queue("campaign_dispatch_queue", {
  connection: redisConnection,
  defaultJobOptions
});

export const analyticsProjectionQueue = new Queue("analytics_projection_queue", {
  connection: redisConnection,
  defaultJobOptions
});

export const lifecycleDispatchQueue = new Queue("lifecycle_dispatch_queue", {
  connection: redisConnection,
  defaultJobOptions
});

function extractBodyVariables(
  body: string,
  vars: { name: string; shopName: string }
): string[] {
  const tokens = body.match(/\{\{[^}]+\}\}/g) ?? [];
  return tokens.map((token) => {
    const key = token.replace(/\{\{|\}\}/g, "").trim().toLowerCase();
    if (key === "name") return vars.name;
    if (key === "shop_name") return vars.shopName;
    return "";
  });
}

async function checkAndIncrementSendQuota(client: PoolClient, merchantId: string) {
  await client.query(
    `INSERT INTO merchant_send_quotas (merchant_id, daily_cap, sent_today, quota_date)
     VALUES ($1, $2, 0, CURRENT_DATE) ON CONFLICT (merchant_id) DO NOTHING`,
    [merchantId, MERCHANT_DAILY_CAP]
  );
  await client.query(
    `UPDATE merchant_send_quotas SET sent_today = CASE WHEN quota_date = CURRENT_DATE THEN sent_today ELSE 0 END,
     quota_date = CURRENT_DATE WHERE merchant_id = $1`,
    [merchantId]
  );
  await client.query(
    `UPDATE platform_send_quota SET sent_today = CASE WHEN quota_date = CURRENT_DATE THEN sent_today ELSE 0 END,
     quota_date = CURRENT_DATE, daily_cap = $1 WHERE id = 1`,
    [PLATFORM_DAILY_CAP]
  );

  const merchantOk = await client.query(
    `UPDATE merchant_send_quotas SET sent_today = sent_today + 1, updated_at = NOW()
     WHERE merchant_id = $1 AND sent_today < daily_cap AND quota_date = CURRENT_DATE RETURNING merchant_id`,
    [merchantId]
  );
  if (!merchantOk.rowCount) return false;

  const platformOk = await client.query(
    `UPDATE platform_send_quota SET sent_today = sent_today + 1, updated_at = NOW()
     WHERE id = 1 AND sent_today < daily_cap AND quota_date = CURRENT_DATE RETURNING id`
  );
  if (!platformOk.rowCount) {
    await client.query(
      `UPDATE merchant_send_quotas SET sent_today = GREATEST(sent_today - 1, 0) WHERE merchant_id = $1`,
      [merchantId]
    );
    return false;
  }
  return true;
}

async function dispatchOne(
  client: PoolClient,
  data: {
    campaignId: string;
    merchantId: string;
    customerId: string;
    mobile: string;
    templateName: string;
    languageCode?: string;
    customerName?: string;
  }
) {
  const allowed = await checkAndIncrementSendQuota(client, data.merchantId);
  if (!allowed) {
    await client.query(
      `UPDATE campaigns SET failed_count = failed_count + 1, updated_at = NOW()
       WHERE id = $1 AND merchant_id = $2`,
      [data.campaignId, data.merchantId]
    );
    return;
  }

  let providerMessageId = `mock-${randomUUID()}`;
  let status = "sent";

  try {
    if (waAdapter) {
      const result = await waAdapter.sendTemplateMessage({
        to: data.mobile,
        templateName: data.templateName,
        languageCode: data.languageCode ?? "en",
        variables: data.customerName ? { name: data.customerName } : undefined
      });
      providerMessageId = result.providerMessageId;
    }
  } catch (error) {
    console.error("WhatsApp send failed", error);
    status = "failed";
    await client.query(
      `UPDATE campaigns SET failed_count = failed_count + 1, updated_at = NOW()
       WHERE id = $1 AND merchant_id = $2`,
      [data.campaignId, data.merchantId]
    );
    await client.query(
      `UPDATE merchant_send_quotas SET sent_today = GREATEST(sent_today - 1, 0) WHERE merchant_id = $1`,
      [data.merchantId]
    );
    return;
  }

  await client.query(
    `INSERT INTO messages (id, merchant_id, customer_id, campaign_id, provider, provider_message_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [randomUUID(), data.merchantId, data.customerId, data.campaignId, "cloud_api", providerMessageId, status]
  );
  await client.query(
    `UPDATE campaigns SET sent_count = sent_count + 1, updated_at = NOW()
     WHERE id = $1 AND merchant_id = $2`,
    [data.campaignId, data.merchantId]
  );
  await client.query(
    `INSERT INTO daily_merchant_metrics (merchant_id, metric_date, messages_sent)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (merchant_id, metric_date) DO UPDATE SET
       messages_sent = daily_merchant_metrics.messages_sent + 1, updated_at = NOW()`,
    [data.merchantId]
  );
}

new Worker(
  "campaign_dispatch_queue",
  async (job) => {
    const client = await db.connect();
    try {
      if (job.name === "campaign.dispatch.batch") {
        const { campaignId, merchantId, templateName, recipients } = job.data as {
          campaignId: string;
          merchantId: string;
          templateName: string;
          recipients: Array<{ customerId: string; mobile: string; name?: string }>;
        };
        const template = await client.query<{ language_code: string }>(
          `SELECT t.language_code FROM campaigns c JOIN templates t ON t.id = c.template_id
           WHERE c.id = $1 AND c.merchant_id = $2`,
          [campaignId, merchantId]
        );
        const languageCode = template.rows[0]?.language_code ?? "en";

        for (const recipient of recipients) {
          await dispatchOne(client, {
            campaignId,
            merchantId,
            customerId: recipient.customerId,
            mobile: recipient.mobile,
            templateName,
            languageCode,
            customerName: recipient.name
          });
        }
      } else {
        await dispatchOne(client, {
          campaignId: job.data.campaignId,
          merchantId: job.data.merchantId,
          customerId: job.data.customerId,
          mobile: job.data.mobile,
          templateName: job.data.templateName ?? "default",
          languageCode: job.data.languageCode
        });
      }
    } finally {
      client.release();
    }
  },
  { connection: redisConnection, concurrency: 10 }
);

new Worker(
  "analytics_projection_queue",
  async (job) => {
    const { merchantId, eventType } = job.data as {
      merchantId: string;
      eventType: string;
    };
    if (eventType === "delivered") {
      await db.query(
        `INSERT INTO daily_merchant_metrics (merchant_id, metric_date, messages_delivered)
         VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (merchant_id, metric_date) DO UPDATE SET
           messages_delivered = daily_merchant_metrics.messages_delivered + 1, updated_at = NOW()`,
        [merchantId]
      );
    } else if (eventType === "read") {
      await db.query(
        `INSERT INTO daily_merchant_metrics (merchant_id, metric_date, messages_read)
         VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (merchant_id, metric_date) DO UPDATE SET
           messages_read = daily_merchant_metrics.messages_read + 1, updated_at = NOW()`,
        [merchantId]
      );
    }
  },
  { connection: redisConnection, concurrency: 10 }
);

async function dispatchLifecycle(scheduleId: string) {
  const client = await db.connect();
  try {
    const schedule = await client.query<{
      id: string;
      merchant_id: string;
      customer_id: string;
      status: string;
    }>(
      `SELECT id, merchant_id, customer_id, status FROM lifecycle_schedules WHERE id = $1`,
      [scheduleId]
    );
    if (!schedule.rowCount || schedule.rows[0].status !== "pending") return;

    const row = await client.query<{
      schedule_id: string;
      merchant_id: string;
      customer_id: string;
      mobile: string;
      customer_name: string;
      whatsapp_opt_in: boolean;
      template_name: string;
      language_code: string;
      body: string;
      header_text: string | null;
      header_image_url: string | null;
      buttons: Array<{ type: string; text: string; value: string }>;
      shop_name: string;
    }>(
      `SELECT ls.id AS schedule_id, ls.merchant_id, ls.customer_id, c.mobile, c.name AS customer_name, c.whatsapp_opt_in,
              t.name AS template_name, t.language_code, t.body, t.header_text, t.header_image_url,
              t.buttons, m.business_name AS shop_name
       FROM lifecycle_schedules ls
       JOIN customers c ON c.id = ls.customer_id
       JOIN templates t ON t.id = ls.template_id
       JOIN merchants m ON m.id = ls.merchant_id
       WHERE ls.id = $1 AND ls.status = 'pending'`,
      [scheduleId]
    );
    if (!row.rowCount) return;

    const data = row.rows[0];
    if (!data.whatsapp_opt_in) {
      await client.query(`UPDATE lifecycle_schedules SET status = 'cancelled' WHERE id = $1`, [
        scheduleId
      ]);
      return;
    }

    const allowed = await checkAndIncrementSendQuota(client, data.merchant_id);
    if (!allowed) {
      await client.query(`UPDATE lifecycle_schedules SET status = 'failed' WHERE id = $1`, [
        scheduleId
      ]);
      return;
    }

    const bodyVariables = extractBodyVariables(data.body, {
      name: data.customer_name,
      shopName: data.shop_name
    });

    const urlButtons = (data.buttons ?? [])
      .map((b, index) => (b.type === "url" ? { index, urlParameter: b.value } : null))
      .filter((b): b is { index: number; urlParameter: string } => b !== null);

    let providerMessageId = `mock-${randomUUID()}`;
    let status = "sent";

    try {
      if (waAdapter) {
        const header = data.header_image_url
          ? { type: "image" as const, imageUrl: data.header_image_url }
          : data.header_text
            ? { type: "text" as const, text: data.header_text }
            : undefined;

        const result = await waAdapter.sendTemplateMessage({
          to: data.mobile,
          templateName: data.template_name,
          languageCode: data.language_code ?? "en",
          header,
          bodyVariables,
          buttons: urlButtons.map((b) => ({ type: "url" as const, ...b }))
        });
        providerMessageId = result.providerMessageId;
      }
    } catch (error) {
      console.error("Lifecycle WhatsApp send failed", error);
      status = "failed";
      await client.query(`UPDATE lifecycle_schedules SET status = 'failed' WHERE id = $1`, [
        scheduleId
      ]);
      await client.query(
        `UPDATE merchant_send_quotas SET sent_today = GREATEST(sent_today - 1, 0) WHERE merchant_id = $1`,
        [data.merchant_id]
      );
      return;
    }

    const messageId = randomUUID();
    await client.query(
      `INSERT INTO messages (id, merchant_id, customer_id, campaign_id, provider, provider_message_id, status, lifecycle_schedule_id)
       VALUES ($1,$2,$3,NULL,$4,$5,$6,$7)`,
      [
        messageId,
        data.merchant_id,
        data.customer_id,
        "cloud_api",
        providerMessageId,
        status,
        scheduleId
      ]
    );
    await client.query(
      `UPDATE lifecycle_schedules SET status = 'sent', sent_message_id = $1 WHERE id = $2`,
      [messageId, scheduleId]
    );
    await client.query(
      `INSERT INTO daily_merchant_metrics (merchant_id, metric_date, messages_sent)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (merchant_id, metric_date) DO UPDATE SET
         messages_sent = daily_merchant_metrics.messages_sent + 1, updated_at = NOW()`,
      [data.merchant_id]
    );
  } finally {
    client.release();
  }
}

new Worker(
  "lifecycle_dispatch_queue",
  async (job) => {
    if (job.name === "lifecycle.dispatch") {
      const { scheduleId } = job.data as { scheduleId: string };
      await dispatchLifecycle(scheduleId);
    }
  },
  { connection: redisConnection, concurrency: 10 }
);

async function reconcileLifecycleSchedules() {
  const due = await db.query<{ id: string; bull_job_id: string | null }>(
    `SELECT id, bull_job_id FROM lifecycle_schedules
     WHERE status = 'pending' AND scheduled_at < NOW() - INTERVAL '2 minutes'
     LIMIT 200`
  );
  for (const row of due.rows) {
    const jobId = row.bull_job_id ?? lifecycleBullJobId(row.id);
    const existing = await lifecycleDispatchQueue.getJob(jobId);
    if (!existing) {
      await lifecycleDispatchQueue.add(
        "lifecycle.dispatch",
        { scheduleId: row.id },
        { jobId, delay: 0 }
      );
    }
  }
}

setInterval(() => {
  void reconcileLifecycleSchedules();
}, 15 * 60 * 1000);

console.log(
  waAdapter
    ? "Worker started with WhatsApp Cloud API enabled."
    : "Worker started in mock mode (WA credentials missing)."
);
