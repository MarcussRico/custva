import dotenv from "dotenv";
import { Queue, Worker, type JobsOptions } from "bullmq";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

dotenv.config({ path: "../../.env" });
dotenv.config({ path: "../../.env.local" });
dotenv.config({ path: "../../.env.example" });

const redisConnection = {
  url: process.env.REDIS_URL ?? "redis://localhost:6379"
};
const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  removeOnComplete: 500,
  removeOnFail: 1000,
  backoff: {
    type: "exponential",
    delay: 2000
  }
};

export const campaignDispatchQueue = new Queue("campaign_dispatch_queue", {
  connection: redisConnection,
  defaultJobOptions
});

export const analyticsProjectionQueue = new Queue("analytics_projection_queue", {
  connection: redisConnection,
  defaultJobOptions
});

export const messageStatusReconcileQueue = new Queue("message_status_reconcile_queue", {
  connection: redisConnection,
  defaultJobOptions
});

new Worker(
  "campaign_dispatch_queue",
  async (job) => {
    console.log("Dispatching campaign message", job.id, job.data);
    await db.query(
      `INSERT INTO messages (id, merchant_id, customer_id, campaign_id, provider, provider_message_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        randomUUID(),
        job.data.merchantId,
        job.data.customerId,
        job.data.campaignId,
        "cloud_api",
        `mock-${job.id}`,
        "sent"
      ]
    );
    await db.query(
      `UPDATE campaigns
       SET sent_count = sent_count + 1, updated_at = NOW()
       WHERE id = $1 AND merchant_id = $2`,
      [job.data.campaignId, job.data.merchantId]
    );
    await messageStatusReconcileQueue.add(
      "message.reconcile",
      {
        campaignId: job.data.campaignId,
        merchantId: job.data.merchantId
      },
      { delay: 2 * 60 * 1000 }
    );
    await analyticsProjectionQueue.add("analytics.project", {
      merchantId: job.data.merchantId,
      campaignId: job.data.campaignId,
      eventType: "sent",
      eventAt: new Date().toISOString()
    });
  },
  { connection: redisConnection, concurrency: 20 }
);

new Worker(
  "analytics_projection_queue",
  async (job) => {
    console.log("Projecting analytics event", job.id, job.data);
    await db.query(
      `UPDATE campaigns
       SET delivered_count = delivered_count + 1, updated_at = NOW()
       WHERE id = $1 AND merchant_id = $2`,
      [job.data.campaignId, job.data.merchantId]
    );
  },
  { connection: redisConnection, concurrency: 10 }
);

new Worker(
  "message_status_reconcile_queue",
  async (job) => {
    console.log("Reconciling pending statuses", job.id, job.data);
    await db.query(
      `UPDATE messages
       SET status = 'delivered', delivered_at = NOW(), updated_at = NOW()
       WHERE campaign_id = $1 AND merchant_id = $2 AND status = 'sent'`,
      [job.data.campaignId, job.data.merchantId]
    );
  },
  { connection: redisConnection, concurrency: 5 }
);

console.log("Worker started and listening to queues.");
