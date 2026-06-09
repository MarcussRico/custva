import type { PoolClient } from "pg";
import { query } from "./db.js";

export async function projectVisitMetrics(
  client: PoolClient | null,
  merchantId: string,
  billingAmount: number,
  isNewCustomer: boolean
) {
  const isRepeatVisit = !isNewCustomer;
  const run = client
    ? (sql: string, params: unknown[]) => client.query(sql, params)
    : (sql: string, params: unknown[]) => query(sql, params);

  await run(
    `INSERT INTO daily_merchant_metrics (merchant_id, metric_date, new_customers, visits, revenue, retention_revenue)
     VALUES ($1, CURRENT_DATE, $2, 1, $3, $4)
     ON CONFLICT (merchant_id, metric_date) DO UPDATE SET
       new_customers = daily_merchant_metrics.new_customers + EXCLUDED.new_customers,
       visits = daily_merchant_metrics.visits + 1,
       revenue = daily_merchant_metrics.revenue + EXCLUDED.revenue,
       retention_revenue = daily_merchant_metrics.retention_revenue + EXCLUDED.retention_revenue,
       updated_at = NOW()`,
    [merchantId, isNewCustomer ? 1 : 0, billingAmount, isRepeatVisit ? billingAmount : 0]
  );
}

export async function projectMessageSent(merchantId: string) {
  await query(
    `INSERT INTO daily_merchant_metrics (merchant_id, metric_date, messages_sent)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (merchant_id, metric_date) DO UPDATE SET
       messages_sent = daily_merchant_metrics.messages_sent + 1,
       updated_at = NOW()`,
    [merchantId]
  );
}

export async function projectMessageDelivered(merchantId: string) {
  await query(
    `INSERT INTO daily_merchant_metrics (merchant_id, metric_date, messages_delivered)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (merchant_id, metric_date) DO UPDATE SET
       messages_delivered = daily_merchant_metrics.messages_delivered + 1,
       updated_at = NOW()`,
    [merchantId]
  );
}

export async function projectMessageRead(merchantId: string) {
  await query(
    `INSERT INTO daily_merchant_metrics (merchant_id, metric_date, messages_read)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (merchant_id, metric_date) DO UPDATE SET
       messages_read = daily_merchant_metrics.messages_read + 1,
       updated_at = NOW()`,
    [merchantId]
  );
}
