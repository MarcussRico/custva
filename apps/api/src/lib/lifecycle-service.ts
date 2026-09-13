import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { lifecycleBullJobId, rhythmNudgeOffsetsDays } from "@custva/shared";
import { canMessage, type ConsentState } from "@custva/shared";
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

/**
 * Day 0 acknowledgement, then two nudges pinned to the customer's own gap:
 * one as they become At-Risk, one before they tip into Dormant. The day_7 and
 * day_14 templates carry the right wording for those moments already
 * ("A week since we met", "We miss you"), so the copy is reused rather than
 * duplicated — only the timing changes.
 */
function buildRhythmPlan(
  visitAt: Date,
  expectedGapDays: number
): Array<{ day: LifecycleDay; scheduledAt: Date }> {
  const [atRiskDays, dormantDays] = rhythmNudgeOffsetsDays(expectedGapDays);
  const dayMs = 24 * 60 * 60 * 1000;
  return [
    { day: "day_0", scheduledAt: new Date(visitAt.getTime() + DAY_OFFSET_MS.day_0) },
    { day: "day_7", scheduledAt: new Date(visitAt.getTime() + atRiskDays * dayMs) },
    { day: "day_14", scheduledAt: new Date(visitAt.getTime() + dormantDays * dayMs) }
  ];
}

export async function enrollAfterVisit(
  client: PoolClient,
  input: EnrollAfterVisitInput
): Promise<EnrollResult> {
  const tier = tierFromVisitCount(input.totalVisitsAfter);
  const visitGroup = visitGroupFromTier(tier);

  /* Consent gate — defect 7. This used to read the `whatsapp_opt_in` boolean,
     which was hardcoded TRUE on insert and therefore always passed. It now
     asks the ledger's projection, so a customer who replied STOP is never
     enrolled into a lifecycle journey in the first place, rather than being
     enrolled and filtered later by a check that might be missed. */
  const consent = await client.query<{
    consent_state: ConsentState;
    whatsapp_opt_in: boolean;
  }>(
    `SELECT consent_state, whatsapp_opt_in FROM customers WHERE id = $1 AND merchant_id = $2`,
    [input.customerId, input.merchantId]
  );
  const consentOk =
    consent.rowCount &&
    consent.rows[0].whatsapp_opt_in &&
    canMessage(consent.rows[0].consent_state);
  if (!consentOk) {
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

  /* FR-I1 — when to send, for someone whose rhythm we know.
     ------------------------------------------------------------------
     A first-time visitor has no rhythm, so the fixed day 0/3/7/14 grid is
     still the right nurture sequence for them.

     For everyone else the grid actively misfires: a customer who comes
     monthly is chased on day 3, day 7 and day 14 while perfectly on
     schedule. Those messages cost money, land as nagging, and are how a
     sending number collects the blocks and reports that wreck its quality
     rating. So a returning customer gets the day-0 acknowledgement, and
     after that nothing until they are actually late by their own standard.

     A regular who comes back on time is cancelled out of both nudges by
     cancelPendingLifecycleSchedules on their next visit, and receives only
     the thank-you. That is the intended outcome, not a gap. */
  const rhythm = await client.query<{ expected_gap_days: string | null }>(
    `SELECT expected_gap_days FROM customers WHERE id = $1`,
    [input.customerId]
  );
  const expectedGapDays =
    rhythm.rows[0]?.expected_gap_days == null
      ? null
      : Number(rhythm.rows[0].expected_gap_days);

  const useRhythm = tier > 1 && expectedGapDays != null;

  const plan: Array<{ day: LifecycleDay; scheduledAt: Date }> = useRhythm
    ? buildRhythmPlan(input.visitAt, expectedGapDays!)
    : LIFECYCLE_DAYS.map((day) => ({ day, scheduledAt: scheduleAt(input.visitAt, day) }));

  for (const { day, scheduledAt } of plan) {
    const templateId = templateByDay.get(day);
    if (!templateId) continue;

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
