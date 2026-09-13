import dotenv from "dotenv";
import { computeSegmentation, lifecycleBullJobId } from "@custva/shared";
import { claimRecipient, settle, settleQuietly } from "./dispatch-claim.js";
import { canMessage, type ConsentState } from "@custva/shared";
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
        accessToken: process.env.WA_ACCESS_TOKEN,
        businessAccountId: process.env.WA_BUSINESS_ACCOUNT_ID
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


/**
 * FR-I2 companion — the per-customer frequency cap.
 *
 * The existing quota is per *merchant* per day (500), which does nothing to
 * stop one unlucky customer receiving every message a merchant sends. Meta's
 * quality rating is driven by individual recipients blocking and reporting, so
 * the cap that actually protects the sending number is the per-person one.
 *
 * Returns false when the customer has already had their allowance. The caller
 * skips the send — this is not a failure, so it does not increment
 * failed_count; the message simply was not appropriate to send.
 */
async function withinCustomerFrequencyCap(
  client: PoolClient,
  merchantId: string,
  customerId: string
): Promise<boolean> {
  const settings = await client.query<{
    customer_message_cap: number;
    customer_message_cap_days: number;
  }>(
    `SELECT customer_message_cap, customer_message_cap_days
       FROM merchants WHERE id = $1`,
    [merchantId]
  );
  if (!settings.rowCount) return true;

  const { customer_message_cap: cap, customer_message_cap_days: days } =
    settings.rows[0];
  if (cap <= 0) return true;

  const recent = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM messages
      WHERE customer_id = $1
        AND created_at >= NOW() - ($2 * INTERVAL '1 day')`,
    [customerId, days]
  );

  const sent = Number(recent.rows[0].count);
  if (sent >= cap) {
    console.log(
      `Frequency cap: skipping send to customer ${customerId} (${sent}/${cap} in ${days}d)`
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
  /* Defect 5 — claim before anything else. A replayed batch stops here for
     every recipient it already reached, which is what turns a retry from
     harmful into useful: it resumes at the failure point instead of starting
     over. */
  if (!(await claimRecipient(client, data.campaignId, data.customerId))) {
    return;
  }

  /* Consent, re-read at the moment of sending — defect 7.
     
     The audience was scoped by consent when the campaign was built, but a
     campaign can sit in the queue for hours and a customer can reply STOP in
     that window. Every other check here is about cost or cadence and can be
     retried; this one cannot be taken back once the message is out. */
  const consent = await client.query<{
    consent_state: ConsentState;
    whatsapp_opt_in: boolean;
  }>(
    `SELECT consent_state, whatsapp_opt_in FROM customers WHERE id = $1 AND merchant_id = $2`,
    [data.customerId, data.merchantId]
  );
  if (
    !consent.rowCount ||
    !consent.rows[0].whatsapp_opt_in ||
    !canMessage(consent.rows[0].consent_state)
  ) {
    await settle(client, data.campaignId, data.customerId, "skipped", "Asked to stop");
    return;
  }

  if (!(await withinCustomerFrequencyCap(client, data.merchantId, data.customerId))) {
    await settle(
      client,
      data.campaignId,
      data.customerId,
      "skipped",
      "Already had their allowance of messages"
    );
    return;
  }

  const allowed = await checkAndIncrementSendQuota(client, data.merchantId);
  if (!allowed) {
    await client.query(
      `UPDATE campaigns SET failed_count = failed_count + 1, updated_at = NOW()
       WHERE id = $1 AND merchant_id = $2`,
      [data.campaignId, data.merchantId]
    );
    await settle(
      client,
      data.campaignId,
      data.customerId,
      "skipped",
      "Daily send limit reached"
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
    await settle(
      client,
      data.campaignId,
      data.customerId,
      "failed",
      error instanceof Error ? error.message.slice(0, 300) : "WhatsApp send failed"
    );
    return;
  }

  /* Marked the instant the provider accepts, before any bookkeeping. Past this
     line the message exists in the world; if the inserts below then fail, the
     recipient must still read as sent or the retry sends to them again. */
  await settleQuietly(client, data.campaignId, data.customerId, "sent");

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

        /* One recipient's failure must not abort the ninety-nine after them.
           Before this, a database error anywhere in dispatchOne escaped the
           loop and failed the whole job — which was defect 5's other half: not
           only did the batch replay, the recipients past the failure point had
           never been attempted at all.

           Recorded and stepped over. A recipient marked `failed` is not retried
           automatically; for paid marketing messages that is the right
           conservative default, and the count is visible on the campaign. */
        for (const recipient of recipients) {
          try {
            await dispatchOne(client, {
              campaignId,
              merchantId,
              customerId: recipient.customerId,
              mobile: recipient.mobile,
              templateName,
              languageCode,
              customerName: recipient.name
            });
          } catch (error) {
            console.error(
              `Campaign ${campaignId}: dispatch to ${recipient.customerId} failed`,
              error
            );
            await settleQuietly(
              client,
              campaignId,
              recipient.customerId,
              "failed",
              error instanceof Error ? error.message.slice(0, 300) : "Dispatch failed"
            );
          }
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
      consent_state: ConsentState;
      template_name: string;
      meta_template_name: string | null;
      meta_status: string | null;
      language_code: string;
      body: string;
      header_text: string | null;
      header_image_url: string | null;
      buttons: Array<{ type: string; text: string; value: string }>;
      shop_name: string;
    }>(
      `SELECT ls.id AS schedule_id, ls.merchant_id, ls.customer_id, c.mobile, c.name AS customer_name, c.whatsapp_opt_in, c.consent_state,
              t.name AS template_name, t.language_code, t.body, t.header_text, t.header_image_url,
              t.buttons, t.meta_template_name, t.meta_status, m.business_name AS shop_name
       FROM lifecycle_schedules ls
       JOIN customers c ON c.id = ls.customer_id
       JOIN templates t ON t.id = ls.template_id
       JOIN merchants m ON m.id = ls.merchant_id
       WHERE ls.id = $1 AND ls.status = 'pending'`,
      [scheduleId]
    );
    if (!row.rowCount) return;

    const data = row.rows[0];
    /* The last gate before a message leaves — defect 7. A customer can reply
       STOP after the schedule was created, so consent is re-read at send time
       rather than trusted from enrolment. Checked here as well as at enrolment
       because these are different moments and only this one is irreversible. */
    if (!data.whatsapp_opt_in || !canMessage(data.consent_state)) {
      await client.query(`UPDATE lifecycle_schedules SET status = 'cancelled' WHERE id = $1`, [
        scheduleId
      ]);
      return;
    }

    /* M3 — a lifecycle message uses the same Meta-registered template as any
       other send. If it is not APPROVED at Meta the send will be refused, so
       fail the schedule here with a readable reason instead of burning a
       WhatsApp API call to discover it. */
    if (data.meta_status !== "APPROVED" || !data.meta_template_name) {
      console.error(
        `Lifecycle schedule ${scheduleId} skipped: template "${data.template_name}" is ` +
          `${data.meta_status ?? "not submitted"} at Meta, not APPROVED.`
      );
      await client.query(`UPDATE lifecycle_schedules SET status = 'failed' WHERE id = $1`, [
        scheduleId
      ]);
      return;
    }

    if (!(await withinCustomerFrequencyCap(client, data.merchant_id, data.customer_id))) {
      await client.query(
        `UPDATE lifecycle_schedules SET status = 'cancelled' WHERE id = $1`,
        [data.schedule_id]
      );
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
          templateName: data.meta_template_name,
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


/**
 * FR-S4 — the periodic segmentation sweep.
 *
 * This is the half of segmentation that is easy to leave out and fatal to
 * omit: At-Risk and Dormant are states a customer enters by doing *nothing*.
 * Recomputing only on visit-write means nobody is ever reclassified for not
 * showing up, so nobody ever becomes At-Risk and the entire intervention model
 * is inert. The product depends on a state transition that happens when no
 * event occurs, so something has to go looking.
 *
 * The rules come from @custva/shared so the worker and the API cannot drift.
 */
async function sweepSegments() {
  const client = await db.connect();
  try {
    const merchants = await client.query<{ id: string }>("SELECT id FROM merchants");

    for (const { id: merchantId } of merchants.rows) {
      // FR-S2 fallback: refresh the cached merchant median first.
      const merchantMedian = await client.query<{ median_gap: string | null }>(
        `WITH gaps AS (
           SELECT EXTRACT(EPOCH FROM (
                    visit_at - LAG(visit_at) OVER (PARTITION BY customer_id ORDER BY visit_at)
                  )) / 86400.0 AS gap
             FROM customer_visits WHERE merchant_id = $1
         )
         SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY gap) AS median_gap
           FROM gaps WHERE gap IS NOT NULL AND gap > 0`,
        [merchantId]
      );
      const medianGapDays =
        merchantMedian.rows[0]?.median_gap == null
          ? null
          : Number(merchantMedian.rows[0].median_gap);

      await client.query(
        `UPDATE merchants SET median_gap_days = $1, median_gap_updated_at = NOW(),
                              updated_at = NOW() WHERE id = $2`,
        [medianGapDays, merchantId]
      );

      /* Only customers whose classification could have moved: their expected
         revisit has passed, or they have never been classified. */
      const due = await client.query<{
        id: string;
        total_visits: number;
        last_visit: Date | null;
      }>(
        `SELECT id, total_visits, last_visit FROM customers
          WHERE merchant_id = $1
            AND (segment IS NULL OR expected_revisit_at IS NULL OR expected_revisit_at <= NOW())`,
        [merchantId]
      );

      for (const customer of due.rows) {
        const visits = await client.query<{ visit_at: Date }>(
          `SELECT visit_at FROM customer_visits
            WHERE customer_id = $1 ORDER BY visit_at DESC LIMIT 30`,
          [customer.id]
        );

        const computed = computeSegmentation({
          visitDates: visits.rows.map((v) => v.visit_at),
          totalVisits: Number(customer.total_visits),
          lastVisit: customer.last_visit,
          merchantMedianGapDays: medianGapDays
        });

        await client.query(
          `UPDATE customers
              SET segment = $1, expected_gap_days = $2, expected_revisit_at = $3,
                  segment_updated_at = NOW(), updated_at = NOW()
            WHERE id = $4`,
          [
            computed.segment,
            computed.expectedGapDays,
            computed.expectedRevisitAt,
            customer.id
          ]
        );
      }

      if (due.rowCount) {
        console.log(
          `Segment sweep: reclassified ${due.rowCount} customer(s) for merchant ${merchantId}`
        );
      }
    }
  } catch (error) {
    console.error("Segment sweep failed", error);
  } finally {
    client.release();
  }
}

setInterval(() => {
  void reconcileLifecycleSchedules();
}, 15 * 60 * 1000);

/* Hourly is plenty: segments move on a scale of days, and the sweep only
   touches customers whose expected revisit has already passed. */
setInterval(() => {
  void sweepSegments();
}, 60 * 60 * 1000);

void sweepSegments();

console.log(
  waAdapter
    ? "Worker started with WhatsApp Cloud API enabled."
    : "Worker started in mock mode (WA credentials missing)."
);
