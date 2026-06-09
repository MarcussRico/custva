import { Router } from "express";
import { sendSuccess } from "../../lib/api-response.js";
import { env } from "../../config.js";
import { query } from "../../lib/db.js";

export const webhookRouter: Router = Router();

webhookRouter.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WA_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(String(challenge ?? ""));
  }

  return res.status(403).send("Forbidden");
});

webhookRouter.post("/whatsapp", async (req, res) => {
  const entry = (req.body as { entry?: Array<{ changes?: Array<{ value?: unknown }> }> }).entry;
  const value = entry?.[0]?.changes?.[0]?.value as
    | {
        statuses?: Array<{
          id: string;
          status: "sent" | "delivered" | "read" | "failed";
          timestamp?: string;
        }>;
      }
    | undefined;

  const statuses = value?.statuses ?? [];
  for (const status of statuses) {
    const messageResult = await query<{
      id: string;
      merchant_id: string;
      campaign_id: string;
    }>(
      "SELECT id, merchant_id, campaign_id FROM messages WHERE provider_message_id = $1 LIMIT 1",
      [status.id]
    );
    if (!messageResult.rowCount) {
      continue;
    }
    const message = messageResult.rows[0];
    await query(
      `UPDATE messages
       SET status = $1,
           delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END,
           opened_at = CASE WHEN $1 = 'read' THEN NOW() ELSE opened_at END,
           updated_at = NOW()
       WHERE id = $2`,
      [status.status, message.id]
    );
    await query(
      `INSERT INTO message_events (message_id, merchant_id, campaign_id, event_type, provider_payload, event_at)
       VALUES ($1, $2, $3, $4, $5, TO_TIMESTAMP($6::double precision))`,
      [
        message.id,
        message.merchant_id,
        message.campaign_id,
        status.status,
        JSON.stringify(status),
        status.timestamp ? Number(status.timestamp) : Math.floor(Date.now() / 1000)
      ]
    );
    if (status.status === "delivered") {
      await query(
        "UPDATE campaigns SET delivered_count = delivered_count + 1, updated_at = NOW() WHERE id = $1",
        [message.campaign_id]
      );
      await query(
        `INSERT INTO daily_merchant_metrics (merchant_id, metric_date, messages_delivered)
         VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (merchant_id, metric_date) DO UPDATE SET
           messages_delivered = daily_merchant_metrics.messages_delivered + 1, updated_at = NOW()`,
        [message.merchant_id]
      );
    }
    if (status.status === "read") {
      await query(
        `INSERT INTO daily_merchant_metrics (merchant_id, metric_date, messages_read)
         VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (merchant_id, metric_date) DO UPDATE SET
           messages_read = daily_merchant_metrics.messages_read + 1, updated_at = NOW()`,
        [message.merchant_id]
      );
    }
    if (status.status === "failed") {
      await query(
        "UPDATE campaigns SET failed_count = failed_count + 1, updated_at = NOW() WHERE id = $1",
        [message.campaign_id]
      );
    }
  }

  return sendSuccess(req, res, {
    accepted: true,
    receivedAt: new Date().toISOString(),
    payload: req.body
  });
});
