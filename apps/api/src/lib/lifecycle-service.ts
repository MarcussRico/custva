import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { lifecycleBullJobId } from "@custva/shared";
import { getLifecycleDispatchQueue } from "./queue.js";

export const LIFECYCLE_DAYS = ["day_0", "day_3", "day_7", "day_14"] as const;
export type LifecycleDay = (typeof LIFECYCLE_DAYS)[number];

const VISIT_GROUP_BY_TIER: Record<number, string> = {
  1: "first_visit",
  2: "second_visit",
  3: "third_visit",
  4: "fourth_visit"
};

const DAY_OFFSET_MS: Record<LifecycleDay, number> = {
  day_0: 5 * 60 * 1000,
  day_3: 3 * 24 * 60 * 60 * 1000,
  day_7: 7 * 24 * 60 * 60 * 1000,
  day_14: 14 * 24 * 60 * 60 * 1000
};

export interface EnrollAfterVisitInput {
  merchantId: string;
  customerId: string;
  visitId: string;
  visitAt: Date;
  totalVisitsAfter: number;
}

export interface LifecycleScheduleJob {
  scheduleId: string;
  scheduledAt: Date;
  bullJobId: string;
}

export function tierFromVisitCount(totalVisits: number): number {
  return Math.min(Math.max(totalVisits, 1), 4);
}

export function visitGroupFromTier(tier: number): string {
  return VISIT_GROUP_BY_TIER[tier] ?? "fourth_visit";
}

function scheduleAt(visitAt: Date, day: LifecycleDay): Date {
  return new Date(visitAt.getTime() + DAY_OFFSET_MS[day]);
}

export async function cancelPendingLifecycleSchedules(
  client: PoolClient,
  customerId: string
): Promise<string[]> {
  const pending = await client.query<{ id: string; bull_job_id: string | null }>(
    `UPDATE lifecycle_schedules
     SET status = 'cancelled'
     WHERE customer_id = $1 AND status = 'pending'
     RETURNING id, bull_job_id`,
    [customerId]
  );
  return pending.rows.map((r) => r.bull_job_id ?? lifecycleBullJobId(r.id));
}

export interface EnrollResult {
  jobs: LifecycleScheduleJob[];
  cancelledJobIds: string[];
}

export async function enrollAfterVisit(
  client: PoolClient,
  input: EnrollAfterVisitInput
): Promise<EnrollResult> {
  const tier = tierFromVisitCount(input.totalVisitsAfter);
  const visitGroup = visitGroupFromTier(tier);

  const optIn = await client.query<{ whatsapp_opt_in: boolean }>(
    `SELECT whatsapp_opt_in FROM customers WHERE id = $1 AND merchant_id = $2`,
    [input.customerId, input.merchantId]
  );
  if (!optIn.rowCount || !optIn.rows[0].whatsapp_opt_in) {
    await client.query(
      `UPDATE customers SET lifecycle_tier = $1, updated_at = NOW() WHERE id = $2`,
      [tier, input.customerId]
    );
    return { jobs: [], cancelledJobIds: [] };
  }

  const cancelledJobIds = await cancelPendingLifecycleSchedules(client, input.customerId);

  const templates = await client.query<{ id: string; lifecycle_day: string }>(
    `SELECT id, lifecycle_day FROM templates
     WHERE merchant_id = $1 AND visit_group = $2 AND archived_at IS NULL
       AND lifecycle_day IS NOT NULL`,
    [input.merchantId, visitGroup]
  );

  const templateByDay = new Map(templates.rows.map((t) => [t.lifecycle_day, t.id]));
  const jobs: LifecycleScheduleJob[] = [];

  for (const day of LIFECYCLE_DAYS) {
    const templateId = templateByDay.get(day);
    if (!templateId) continue;

    const scheduledAt = scheduleAt(input.visitAt, day);
    const scheduleId = randomUUID();
    const bullJobId = lifecycleBullJobId(scheduleId);

    await client.query(
      `INSERT INTO lifecycle_schedules (
         id, merchant_id, customer_id, visit_id, visit_group, lifecycle_day,
         template_id, scheduled_at, status, bull_job_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)`,
      [
        scheduleId,
        input.merchantId,
        input.customerId,
        input.visitId,
        visitGroup,
        day,
        templateId,
        scheduledAt.toISOString(),
        bullJobId
      ]
    );

    jobs.push({ scheduleId, scheduledAt, bullJobId });
  }

  await client.query(
    `UPDATE customers SET lifecycle_tier = $1, updated_at = NOW() WHERE id = $2`,
    [tier, input.customerId]
  );

  return { jobs, cancelledJobIds };
}

export async function removeLifecycleQueueJobs(jobIds: string[]) {
  const queue = getLifecycleDispatchQueue();
  for (const jobId of jobIds) {
    try {
      const job = await queue.getJob(jobId);
      if (job) await job.remove();
    } catch {
      // job may already be processed
    }
  }
}

export async function enqueueLifecycleJobs(jobs: LifecycleScheduleJob[]) {
  const queue = getLifecycleDispatchQueue();
  for (const job of jobs) {
    const delay = Math.max(0, job.scheduledAt.getTime() - Date.now());
    await queue.add(
      "lifecycle.dispatch",
      { scheduleId: job.scheduleId },
      { jobId: job.bullJobId, delay }
    );
  }
}

export function extractBodyVariables(
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
