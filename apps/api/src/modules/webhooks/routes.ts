import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { sendError, sendSuccess } from "../../lib/api-response.js";
import { env, isProduction } from "../../config.js";
import { query, withTransaction } from "../../lib/db.js";
import { classifyInbound } from "@custva/shared";
import { findCustomersByMobile, recordConsent } from "../../lib/consent-service.js";

export const webhookRouter: Router = Router();

function verifyWhatsAppSignature(req: Request, res: Response, next: NextFunction) {
  const appSecret = env.WA_APP_SECRET;
  if (!appSecret) {
    if (isProduction) {
      return sendError(req, res, "INTERNAL_ERROR", "Webhook secret not configured", 500);
    }
    // Local/dev without Meta secret: allow unsigned payloads
    return next();
  }

  const signature = req.headers["x-hub-signature-256"];
  if (typeof signature !== "string" || !signature.startsWith("sha256=")) {
    return sendError(req, res, "AUTH_FORBIDDEN", "Missing webhook signature", 401);
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    return sendError(req, res, "VALIDATION_ERROR", "Missing raw body for signature check", 400);
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signature.slice("sha256=".length);
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");

  if (
    expectedBuf.length !== receivedBuf.length ||
    !timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    return sendError(req, res, "AUTH_FORBIDDEN", "Invalid webhook signature", 401);
  }

  return next();
}


/**
 * Inbound customer messages — the half of the webhook that was never read.
 *
 * Before this, the handler parsed `statuses` and ignored `messages` entirely,
 * so a customer replying STOP was invisible: the message was acknowledged with
 * a 200 and nothing changed. Custva kept messaging someone who had asked it to
 * stop, which is the failure Meta suspends numbers for and the DPDP Act treats
 * as processing without consent.
 */
interface InboundMessage {
  id: string;
  from: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  /* A tap on the template's own opt-out button arrives as one of these rather
     than as typed text. Both carry the label the customer saw. */
  button?: { text?: string; payload?: string };
  interactive?: { button_reply?: { id?: string; title?: string } };
}

/** Whatever the customer actually communicated, however they sent it. */
function inboundText(message: InboundMessage): string | null {
  return (
    message.text?.body ??
    message.button?.text ??
    message.button?.payload ??
    message.interactive?.button_reply?.title ??
    null
  );
}

async function handleInboundMessages(messages: InboundMessage[]): Promise<void> {
  for (const message of messages) {
    const body = inboundText(message);
    const action = classifyInbound(body);
    if (!action) continue;

    /* A number can be a customer of several merchants. A withdrawal is
       addressed to the business that messaged them, and we cannot tell which
       from the payload — so it is recorded against every merchant that holds
       the number. Erring toward more withdrawal is the right direction. */
    const customers = await findCustomersByMobile(message.from);
    if (!customers.length) continue;

    const occurredAt = message.timestamp
      ? new Date(Number(message.timestamp) * 1000)
      : new Date();

    for (const customer of customers) {
      await withTransaction((client) =>
        recordConsent(client, {
          merchantId: customer.merchantId,
          customerId: customer.id,
          action,
          method: "whatsapp_reply",
          source: "customer",
          occurredAt,
          /* The customer's own words, kept verbatim. If the record is ever
             challenged, this is the artefact — not a paraphrase of it. The
             message id also makes the insert idempotent across Meta's
             redeliveries, via the unique index in migration 0023. */
          evidence: {
            providerMessageId: message.id,
            from: message.from,
            body,
            messageType: message.type ?? "text"
          }
        })
      );
    }
  }
}

webhookRouter.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WA_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(String(challenge ?? ""));
  }

  return res.status(403).send("Forbidden");
});

webhookRouter.post("/whatsapp", verifyWhatsAppSignature, async (req, res) => {
  const entry = (req.body as { entry?: Array<{ changes?: Array<{ value?: unknown }> }> }).entry;
  const value = entry?.[0]?.changes?.[0]?.value as
    | {
        statuses?: Array<{
          id: string;
          status: "sent" | "delivered" | "read" | "failed";
          timestamp?: string;
        }>;
        messages?: InboundMessage[];
      }
    | undefined;

  await handleInboundMessages(value?.messages ?? []);

  const statuses = value?.statuses ?? [];
  for (const status of statuses) {
    const messageResult = await query<{
      id: string;
      merchant_id: string;
      campaign_id: string | null;
      lifecycle_schedule_id: string | null;
    }>(
      `SELECT id, merchant_id, campaign_id, lifecycle_schedule_id
       FROM messages WHERE provider_message_id = $1 LIMIT 1`,
      [status.id]
    );
    if (!messageResult.rowCount) {
      continue;
    }
    const message = messageResult.rows[0];
    /* Status only moves forward along sent → delivered → read.
       
       Meta redelivers, and redeliveries arrive out of order: three replays of
       `delivered` landing after a `read` used to overwrite it, so a message the
       customer had opened reported as merely delivered. The event ledger and
       the counters were already right — this is the denormalised column on
       `messages` that display and exports read.
       
       `failed` is not on the ladder and always applies: it is terminal and the
       most actionable thing we could say about the message. */
    await query(
      `UPDATE messages
       SET status = CASE
             WHEN $1 = 'failed' THEN 'failed'
             WHEN status = 'failed' THEN status
             WHEN POSITION(status IN 'sent|delivered|read')
                  > POSITION($1 IN 'sent|delivered|read') THEN status
             ELSE $1
           END,
           delivered_at = CASE WHEN $1 = 'delivered' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
           opened_at = CASE WHEN $1 = 'read' AND opened_at IS NULL THEN NOW() ELSE opened_at END,
           updated_at = NOW()
       WHERE id = $2`,
      [status.status, message.id]
    );
    /* Meta redelivers status webhooks on any non-2xx or timeout — normal
       traffic, not an error. The unique index on (message_id, event_type) plus
       DO NOTHING makes the insert idempotent, and `rowCount` then tells us
       whether this was the first time we saw this event. Every counter below is
       gated on that, so a redelivery no longer inflates the numbers the
       merchant dashboard reports — or that commission will be computed from. */
    const eventInsert = await query(
      `INSERT INTO message_events (
         message_id, merchant_id, campaign_id, lifecycle_schedule_id,
         event_type, provider_payload, event_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, TO_TIMESTAMP($7::double precision))
       ON CONFLICT (message_id, event_type) DO NOTHING`,
      [
        message.id,
        message.merchant_id,
        message.campaign_id,
        message.lifecycle_schedule_id,
        status.status,
        JSON.stringify(status),
        status.timestamp ? Number(status.timestamp) : Math.floor(Date.now() / 1000)
      ]
    );
    const isFirstTimeSeen = (eventInsert.rowCount ?? 0) > 0;
    if (!isFirstTimeSeen) {
      continue;
    }

    if (status.status === "delivered") {
      if (message.campaign_id) {
        await query(
          "UPDATE campaigns SET delivered_count = delivered_count + 1, updated_at = NOW() WHERE id = $1",
          [message.campaign_id]
        );
      }
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
    if (status.status === "failed" && message.campaign_id) {
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
