/**
 * A cafe's last 120 days, simulated with the product's own rules.
 *
 *   cd apps/api && ./node_modules/.bin/tsx scripts/seed-cafe-simulation.ts
 *
 * Why this exists alongside `scripts/seed-demo-shop.mjs`: eight hand-placed
 * customers show every screen, but not what the product does over time. This
 * builds a busy cafe's book — a few hundred customers with real habits (the
 * office crowd, weekly regulars, monthly families, one-time visitors) — and
 * walks it forward day by day, making every decision with the same shared
 * functions production uses:
 *
 *   - segment and expected gap   computeSegmentation      (@custva/shared)
 *   - when reminders are due     rhythmNudgeOffsetsDays   (same offsets as lifecycle-service)
 *   - organic vs brought back    decideAttribution + pickLastTouch
 *   - who is held out            assignHoldout / computeLift
 *
 * What is *invented* is only the behaviour of the customers: how often they
 * come, what they spend, when they drift away, and how likely a reminder is to
 * bring someone back. Those assumptions are listed in BEHAVIOUR below so nobody
 * mistakes a demo number for a measured one.
 *
 * FICTION. The phone numbers are fabricated (the same 98401 block the other
 * demo seed uses). Never connect live WhatsApp credentials to this merchant.
 * Refuses to run with NODE_ENV=production.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  assignHoldout,
  computeSegmentation,
  decideAttribution,
  intoSendingHours,
  pickLastTouch,
  rhythmNudgeOffsetsDays,
  type EligibleMessage,
  type Segment
} from "@custva/shared";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed simulated data in production.");
}

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/custva";
const MERCHANT_ID = "00000000-0000-0000-0000-000000000010";
const DAY = 86_400_000;
const NOW = new Date();
const HORIZON_DAYS = 120;
const START = new Date(NOW.getTime() - HORIZON_DAYS * DAY);
const COMMISSION_RATE = 0.05;
const MESSAGE_CAP = 4;
const MESSAGE_CAP_DAYS = 7;
const NOTICE = "Customer agreed to receive offers and reminders from this shop on WhatsApp.";

/* ── The invented part ──────────────────────────────────────────────────── */
const BEHAVIOUR = {
  /** Share of new customers who say yes at the counter on their first visit. */
  consentAtFirstVisit: 0.72,
  /** Chance an unrecorded customer is asked and agrees on a later visit. */
  consentOnLaterVisit: 0.45,
  /** Chance per message that a customer replies STOP. */
  stopPerMessage: 0.004,
  /** Per visit, chance a regular quietly drifts away. */
  lapsePerVisit: 0.085,
  /** A lapsed customer who comes back unprompted does so after this many gaps. */
  lapsedOrganicReturn: { chance: 0.28, minGaps: 3, maxGaps: 7 },
  /** Chance a READ reminder brings a lapsed customer back within the window. */
  responseIfRead: { at_risk: 0.34, dormant: 0.16, first_time: 0.11, campaign: 0.22 },
  /** Delivered but never opened still works sometimes (preview on the lock screen). */
  responseIfDeliveredOnly: 0.35, // multiplier on the above
  delivered: 0.965,
  read: 0.74
};

/* ── Seeded randomness. The customers and their habits are the same every
   run; exact counts shift a little between runs because the 120-day window
   is anchored to the current time. ─────────────────────────────────────── */
let seed = 20260927;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rand() * (b - a);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/* A cafe's day: busy 8-11 and 4-8, quiet after lunch. */
function cafeTime(dayStart: Date): Date {
  const slots = [8, 8, 9, 9, 9, 10, 10, 11, 12, 13, 16, 17, 17, 18, 18, 19, 19, 20];
  const hour = pick(slots);
  const d = new Date(dayStart);
  d.setHours(hour, Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
  return d;
}
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/* ── People ─────────────────────────────────────────────────────────────── */
const FIRST = [
  "Aarav", "Aditi", "Akash", "Ananya", "Anjali", "Arjun", "Arun", "Bhavana", "Deepa", "Dinesh",
  "Divya", "Gautham", "Harini", "Ishaan", "Janani", "Karthik", "Kavya", "Keerthana", "Lakshmi",
  "Madhav", "Meera", "Mohan", "Nandini", "Naveen", "Nikhil", "Nisha", "Pooja", "Pradeep",
  "Priya", "Rahul", "Rajesh", "Ramya", "Ravi", "Revathi", "Rohit", "Sanjay", "Saranya",
  "Shreya", "Siddharth", "Sneha", "Sowmya", "Srinivas", "Suresh", "Swathi", "Tanvi", "Varun",
  "Vidya", "Vignesh", "Vikram", "Yamini", "Zoya", "Farhan", "Ayesha", "Joseph", "Maria",
  "Sam", "Neha", "Kiran", "Abhishek", "Aishwarya"
] as const;
const LAST = [
  "Iyer", "Pillai", "Nair", "Krishnan", "Rao", "Menon", "Raman", "Subramanian", "Reddy",
  "Sharma", "Venkatesh", "Natarajan", "Balaji", "Chandran", "Srinivasan", "Kumar", "Mohan",
  "Rajan", "Sundaram", "Ganesh", "Thomas", "Fernandes", "Khan", "Joseph", "Das", "Varghese",
  "Murthy", "Shetty", "Bhat", "Anand"
] as const;
const PINCODES = ["600018", "600018", "600004", "600004", "600028", "600017", "600086", "600006", "600014", "600020"];

interface Archetype {
  key: string;
  share: number;
  gap: [number, number];
  spend: [number, number];
  /** Visits before the habit is established (for one-timers: 1). */
  oneTime?: boolean;
}
const ARCHETYPES: Archetype[] = [
  { key: "office-daily", share: 0.08, gap: [2, 3.5], spend: [90, 190] },
  { key: "twice-weekly", share: 0.12, gap: [3.5, 5], spend: [140, 320] },
  { key: "weekly", share: 0.25, gap: [6, 8.5], spend: [180, 460] },
  { key: "fortnightly", share: 0.17, gap: [12, 17], spend: [240, 620] },
  { key: "monthly-family", share: 0.1, gap: [26, 34], spend: [480, 1250] },
  { key: "one-time", share: 0.28, gap: [30, 60], spend: [150, 520], oneTime: true }
];

interface VisitRec {
  id: string;
  at: Date;
  amount: number;
  isFirst: boolean;
  segmentAtVisit: Segment | null;
  returnType: "organic" | "custva_influenced";
  attributedMessageId: string | null;
  /** Simulation ground truth — would this visit have happened without a message? */
  cause: "own" | "message" | "scripted";
}
interface MessageRec {
  id: string;
  customerId: string;
  campaignId: string | null;
  scheduleId: string | null;
  createdAt: Date;
  status: "read" | "delivered" | "failed";
  deliveredAt: Date | null;
  openedAt: Date | null;
}
interface ScheduleRec {
  id: string;
  customerId: string;
  visitId: string;
  group: string;
  day: "day_0" | "day_3" | "day_7" | "day_14";
  at: Date;
  status: "pending" | "sent" | "cancelled" | "failed";
  messageId: string | null;
  /** Which kind of nudge this is, for the response model. */
  kind: "thanks" | "first_time" | "at_risk" | "dormant";
}
interface ConsentRec {
  action: "granted" | "withdrawn";
  method: string;
  source: string;
  at: Date;
  noticeText: string | null;
  body?: string;
}
interface Person {
  id: string;
  name: string;
  mobile: string;
  pincode: string | null;
  age: number | null;
  dob: string | null;
  arch: Archetype;
  gapMean: number;
  spendRange: [number, number];
  joinedAt: Date;
  visits: VisitRec[];
  consent: "unknown" | "granted" | "withdrawn";
  consents: ConsentRec[];
  lapsed: boolean;
  /** Next visit the person makes on their own, or null if they will not. */
  nextOrganic: Date | null;
  /** A visit a message has prompted. */
  prompted: Date | null;
  /** Scripted people for the video: exact history, no random response. */
  scripted?: boolean;
}

const usedMobiles = new Set<string>();
function mobileFor(i: number): string {
  /* 98401 + five digits, sequential from a fixed offset — fabricated, and
     predictable enough that nobody mistakes them for a real list. */
  /* Stored the way the API's normalizeIndiaMobile stores them (+91…), so a
     visit recorded at the counter finds this person instead of creating a
     duplicate. seed-demo-shop.mjs stores bare 10 digits and has that bug. */
  const m = `+9198401${String(20000 + i * 7).padStart(5, "0")}`;
  usedMobiles.add(m);
  return m;
}

const people: Person[] = [];
const messages: MessageRec[] = [];
const schedules: ScheduleRec[] = [];

function newPerson(i: number, joinedAt: Date, arch?: Archetype): Person {
  let a = arch;
  if (!a) {
    let r = rand();
    a = ARCHETYPES[ARCHETYPES.length - 1];
    for (const cand of ARCHETYPES) {
      if (r < cand.share) {
        a = cand;
        break;
      }
      r -= cand.share;
    }
  }
  const age = chance(0.8) ? Math.round(between(19, 58)) : null;
  const dob =
    age != null && chance(0.45)
      ? `${NOW.getFullYear() - age}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`
      : null;
  return {
    id: randomUUID(),
    name: `${pick(FIRST)} ${pick(LAST)}`,
    mobile: mobileFor(i),
    pincode: chance(0.7) ? pick(PINCODES) : null,
    age,
    dob,
    arch: a,
    gapMean: between(a.gap[0], a.gap[1]),
    spendRange: a.spend,
    joinedAt,
    visits: [],
    consent: "unknown",
    consents: [],
    lapsed: false,
    nextOrganic: joinedAt,
    prompted: null
  };
}

/* ── Merchant median (FR-S2 fallback), refreshed weekly like the sweep ──── */
let merchantMedian: number | null = null;
function refreshMedian() {
  const gaps: number[] = [];
  for (const p of people) {
    for (let i = 1; i < p.visits.length; i++) {
      const g = (p.visits[i].at.getTime() - p.visits[i - 1].at.getTime()) / DAY;
      if (g > 0) gaps.push(g);
    }
  }
  if (!gaps.length) return;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  merchantMedian = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

function segNow(p: Person, at: Date) {
  const last = p.visits[p.visits.length - 1];
  return computeSegmentation({
    visitDates: p.visits.slice(-30).map((v) => v.at),
    totalVisits: p.visits.length,
    lastVisit: last ? last.at : null,
    merchantMedianGapDays: merchantMedian,
    now: at
  });
}

/* ── Message delivery ───────────────────────────────────────────────────── */
function recentMessageCount(customerId: string, at: Date): number {
  const from = at.getTime() - MESSAGE_CAP_DAYS * DAY;
  let n = 0;
  for (const m of messages) {
    if (m.customerId === customerId && m.createdAt.getTime() >= from && m.createdAt <= at) n++;
  }
  return n;
}

function deliver(
  p: Person,
  at: Date,
  opts: { campaignId?: string; scheduleId?: string; forceRead?: boolean }
): MessageRec {
  const delivered = opts.forceRead || chance(BEHAVIOUR.delivered);
  const read = delivered && (opts.forceRead || chance(BEHAVIOUR.read));
  const deliveredAt = delivered ? new Date(at.getTime() + between(2, 40) * 1000) : null;
  /* Most reads happen within a few hours; some the next morning. */
  const openedAt =
    read && deliveredAt
      ? new Date(deliveredAt.getTime() + Math.exp(between(Math.log(3), Math.log(14 * 60))) * 60_000)
      : null;
  const m: MessageRec = {
    id: randomUUID(),
    customerId: p.id,
    campaignId: opts.campaignId ?? null,
    scheduleId: opts.scheduleId ?? null,
    createdAt: at,
    status: read ? "read" : delivered ? "delivered" : "failed",
    deliveredAt,
    openedAt
  };
  messages.push(m);
  /* A small share of people answer STOP. The ledger records it and nothing is
     sent to them again — the same path as the real webhook. */
  if (!p.scripted && delivered && chance(BEHAVIOUR.stopPerMessage)) {
    const when = new Date((openedAt ?? deliveredAt!).getTime() + 60_000);
    if (when < NOW) {
      p.consent = "withdrawn";
      p.consents.push({
        action: "withdrawn",
        method: "whatsapp_reply",
        source: "customer",
        at: when,
        noticeText: null,
        body: "STOP"
      });
      for (const s of schedules) {
        if (s.customerId === p.id && s.status === "pending") s.status = "cancelled";
      }
    }
  }
  return m;
}

/** Maybe the message brings a lapsed person back. */
function respond(p: Person, m: MessageRec, kind: keyof typeof BEHAVIOUR.responseIfRead) {
  if (p.scripted || !p.lapsed && kind !== "first_time") return;
  if (m.status === "failed") return;
  let prob = BEHAVIOUR.responseIfRead[kind];
  if (m.status === "delivered") prob *= BEHAVIOUR.responseIfDeliveredOnly;
  if (!chance(prob)) return;
  const engaged = (m.openedAt ?? m.deliveredAt)!;
  /* Inside the 7-day window, weighted toward the first few days. */
  const inDays = Math.min(6.5, 0.3 + Math.pow(rand(), 1.6) * 6);
  const when = cafeTime(startOfDay(new Date(engaged.getTime() + inDays * DAY)));
  const at = when < engaged ? new Date(engaged.getTime() + 2 * 3600_000) : when;
  if (at >= NOW) return;
  if (!p.prompted || at < p.prompted) p.prompted = at;
}

/* ── Visits ─────────────────────────────────────────────────────────────── */
function templateGroup(totalVisits: number) {
  return ["first_visit", "second_visit", "third_visit", "fourth_visit"][Math.min(totalVisits, 4) - 1];
}

function recordVisit(p: Person, at: Date, amount?: number, cause: VisitRec["cause"] = "own") {
  const before = p.visits.length ? segNow(p, at).segment : null;
  const isFirst = p.visits.length === 0;

  /* Consent at the counter — the only moment the customer is standing there. */
  if (p.consent === "unknown" && !p.scripted) {
    if (chance(isFirst ? BEHAVIOUR.consentAtFirstVisit : BEHAVIOUR.consentOnLaterVisit)) {
      p.consent = "granted";
      p.consents.push({ action: "granted", method: "counter_verbal", source: "merchant_staff", at, noticeText: NOTICE });
    }
  }

  /* Attribution: last touch inside 7 days, segment as it was *before* this visit. */
  const windowStart = at.getTime() - 7 * DAY;
  const eligible: EligibleMessage[] = messages
    .filter((m) => m.customerId === p.id)
    .map((m) => ({ m, engaged: m.openedAt ?? m.deliveredAt }))
    .filter((x) => x.engaged && x.engaged.getTime() <= at.getTime() && x.engaged.getTime() >= windowStart)
    .map((x) => ({ id: x.m.id, engagedAt: x.engaged!, wasRead: x.m.openedAt != null }));
  const decision = decideAttribution({
    isFirstVisit: isFirst,
    segmentAtVisit: before,
    eligibleMessage: pickLastTouch(eligible),
    windowDays: 7
  });

  const spend = amount ?? roundTo(between(p.spendRange[0], p.spendRange[1]), 10);
  const visit: VisitRec = {
    id: randomUUID(),
    at,
    amount: spend,
    isFirst,
    segmentAtVisit: before,
    returnType: decision.returnType,
    attributedMessageId: decision.attributedMessageId,
    cause: p.scripted ? "scripted" : cause
  };
  p.visits.push(visit);

  /* Any reminder still waiting is pointless now — they came in. */
  for (const s of schedules) {
    if (s.customerId === p.id && s.status === "pending") s.status = "cancelled";
  }

  /* Enrol the next journey, mirroring lifecycle-service.enrollAfterVisit. */
  if (p.consent === "granted") {
    const group = templateGroup(p.visits.length);
    const after = segNow(p, at);
    const plan: Array<{ day: ScheduleRec["day"]; offsetDays: number; kind: ScheduleRec["kind"] }> =
      p.visits.length === 1
        ? [
            { day: "day_0", offsetDays: 5 / 1440, kind: "thanks" },
            { day: "day_3", offsetDays: 3, kind: "first_time" },
            { day: "day_7", offsetDays: 7, kind: "first_time" },
            { day: "day_14", offsetDays: 14, kind: "first_time" }
          ]
        : (() => {
            const [atRisk, dormant] = rhythmNudgeOffsetsDays(after.expectedGapDays);
            return [
              { day: "day_0", offsetDays: 5 / 1440, kind: "thanks" as const },
              { day: "day_7", offsetDays: atRisk, kind: "at_risk" as const },
              { day: "day_14", offsetDays: dormant, kind: "dormant" as const }
            ];
          })();
    for (const step of plan) {
      schedules.push({
        id: randomUUID(),
        customerId: p.id,
        visitId: visit.id,
        group,
        day: step.day,
        at: intoSendingHours(new Date(at.getTime() + step.offsetDays * DAY)),
        status: "pending",
        messageId: null,
        kind: step.kind
      });
    }
  }

  /* What they do next on their own. */
  if (p.scripted) return;
  if (p.arch.oneTime) {
    p.lapsed = true;
    p.nextOrganic = chance(0.12) ? new Date(at.getTime() + between(p.arch.gap[0], p.arch.gap[1]) * DAY) : null;
  } else if (p.visits.length > 2 && chance(BEHAVIOUR.lapsePerVisit)) {
    p.lapsed = true;
    const o = BEHAVIOUR.lapsedOrganicReturn;
    p.nextOrganic = chance(o.chance)
      ? new Date(at.getTime() + p.gapMean * between(o.minGaps, o.maxGaps) * DAY)
      : null;
  } else {
    p.lapsed = false;
    p.nextOrganic = new Date(at.getTime() + p.gapMean * between(0.72, 1.28) * DAY);
  }
  p.prompted = null;
}

/* ── Campaigns ─────────────────────────────────────────────────────────── */
interface CampaignPlan {
  id: string;
  name: string;
  templateKey: string;
  daysAgo: number;
  segments: Segment[];
  overdueOnly?: boolean;
  audience?: Array<{ id: string; arm: "treatment" | "holdout"; status: string; note: string | null }>;
  sentAt?: Date;
  holdoutPercentUsed?: number | null;
}
const CAMPAIGNS: CampaignPlan[] = [
  { id: randomUUID(), name: "Rainy day filter coffee", templateKey: "monsoon", daysAgo: 64, segments: ["at_risk", "dormant"] },
  { id: randomUUID(), name: "New weekend brunch", templateKey: "brunch", daysAgo: 29, segments: ["at_risk", "dormant", "first_time"] },
  { id: randomUUID(), name: "We saved your table", templateKey: "table", daysAgo: 10, segments: ["at_risk", "dormant"], overdueOnly: true }
];

function runCampaign(c: CampaignPlan, at: Date) {
  const pool = people
    .filter((p) => p.visits.length > 0 && p.consent === "granted")
    .map((p) => ({ p, s: segNow(p, at) }))
    .filter(({ s }) => c.segments.includes(s.segment))
    .filter(({ s }) => !c.overdueOnly || (s.expectedRevisitAt != null && s.expectedRevisitAt <= at));
  const split = assignHoldout(
    pool.map(({ p, s }) => ({ id: p.id, segment: s.segment })),
    { campaignId: c.id, percent: 10 }
  );
  c.sentAt = at;
  c.holdoutPercentUsed = split.holdout.length ? split.percentUsed : null;
  c.audience = [];
  const byId = new Map(pool.map((x) => [x.p.id, x]));
  for (const h of split.holdout) c.audience.push({ id: h.id, arm: "holdout", status: "pending", note: null });
  for (const t of split.treatment) {
    const { p } = byId.get(t.id)!;
    const sendAt = new Date(at.getTime() + c.audience.length * 100);
    if (recentMessageCount(p.id, sendAt) >= MESSAGE_CAP) {
      c.audience.push({ id: p.id, arm: "treatment", status: "skipped", note: "Frequency cap" });
      continue;
    }
    const m = deliver(p, sendAt, { campaignId: c.id });
    c.audience.push({ id: p.id, arm: "treatment", status: m.status === "failed" ? "failed" : "sent", note: null });
    respond(p, m, "campaign");
  }
}

/* ── Scripted people the video follows ─────────────────────────────────── */
const at = (daysAgo: number, hour: number, minute = 0) => {
  const d = new Date(NOW.getTime() - daysAgo * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};
interface Script {
  name: string;
  mobile: string;
  pincode: string;
  age: number;
  arch: string;
  gapMean: number;
  visitsDaysAgo: number[];
  spend: number[];
  consent: "granted" | "withdrawn" | "unknown";
  withdrawDaysAgo?: number;
}
const SCRIPTS: Script[] = [
  /* The hero of the video: a weekly regular who missed her week. The rhythm
     nudge went out ~2 days ago and she read it. Staff record her visit live. */
  {
    name: "Anjali Pillai", mobile: "9840112300", pincode: "600018", age: 29, arch: "weekly", gapMean: 7,
    visitsDaysAgo: [81, 74, 67, 60, 53, 46, 39, 32, 25, 18, 11], spend: [260, 310, 240, 280, 350, 220, 300, 270, 330, 290, 310],
    consent: "granted"
  },
  /* On schedule — Custva leaves her alone. */
  {
    name: "Meera Krishnan", mobile: "9840112288", pincode: "600004", age: 34, arch: "twice-weekly", gapMean: 4,
    visitsDaysAgo: [46, 42, 38, 34, 30, 26, 22, 18, 14, 10, 6, 2], spend: [180, 210, 160, 240, 190, 170, 220, 200, 180, 230, 210, 190],
    consent: "granted"
  },
  /* Monthly family, a few days past their day but inside the Loyal band. */
  {
    name: "Vikram Rao", mobile: "9840112299", pincode: "600028", age: 41, arch: "monthly-family", gapMean: 30,
    visitsDaysAgo: [123, 93, 63, 33], spend: [980, 1140, 860, 1210],
    consent: "granted"
  },
  /* Asked to stop: still overdue, never messaged. */
  {
    name: "Rahul Iyer", mobile: "9840112255", pincode: "600017", age: 26, arch: "office-daily", gapMean: 3,
    visitsDaysAgo: [70, 67, 64, 61, 58, 55, 52, 49, 46, 43, 40, 37, 34, 31], spend: [140, 120, 160, 150, 130, 140, 170, 120, 150, 140, 160, 130, 150, 140],
    consent: "withdrawn", withdrawDaysAgo: 29
  }
];

/* ── Run ────────────────────────────────────────────────────────────────── */
function simulate() {
  let index = 0;

  /* Scripted people first, so their numbers are fixed. */
  const scripted: Array<{ p: Person; s: Script }> = [];
  for (const s of SCRIPTS) {
    const arch = ARCHETYPES.find((a) => a.key === s.arch)!;
    const p = newPerson(index++, at(s.visitsDaysAgo[0], 9), arch);
    usedMobiles.add(s.mobile);
    p.name = s.name;
    p.mobile = `+91${s.mobile}`;
    p.pincode = s.pincode;
    p.age = s.age;
    p.gapMean = s.gapMean;
    p.scripted = true;
    p.nextOrganic = null;
    people.push(p);
    scripted.push({ p, s });
  }

  const arrivals: Date[] = [];
  /* New faces: ~3.1 a day, busier on weekends. */
  for (let d = 0; d < HORIZON_DAYS; d++) {
    const day = startOfDay(new Date(START.getTime() + d * DAY));
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const n = Math.round(between(1.5, 4.2) * (weekend ? 1.45 : 1));
    for (let k = 0; k < n; k++) arrivals.push(cafeTime(day));
  }
  for (const when of arrivals) {
    const p = newPerson(index++, when);
    p.nextOrganic = when;
    people.push(p);
  }

  const campaignQueue = [...CAMPAIGNS].sort((a, b) => b.daysAgo - a.daysAgo);

  /* Walk forward in hourly steps so ordering inside a day is right. */
  const STEP = 3600_000;
  let lastMedian = 0;
  for (let t = START.getTime() - 130 * DAY; t <= NOW.getTime(); t += STEP) {
    const now = new Date(t);

    if (t - lastMedian >= 7 * DAY) {
      refreshMedian();
      lastMedian = t;
    }

    /* Scripted visits and consent. */
    for (const { p, s } of scripted) {
      for (let i = 0; i < s.visitsDaysAgo.length; i++) {
        const va = at(s.visitsDaysAgo[i], i % 2 ? 18 : 9, 15 + i);
        if (va.getTime() > t - STEP && va.getTime() <= t) {
          if (i === 0 && s.consent !== "unknown") {
            p.consent = "granted";
            p.consents.push({ action: "granted", method: "counter_verbal", source: "merchant_staff", at: va, noticeText: NOTICE });
          }
          recordVisit(p, va, s.spend[i]);
        }
      }
      if (s.withdrawDaysAgo != null) {
        const wa = at(s.withdrawDaysAgo, 20, 12);
        if (wa.getTime() > t - STEP && wa.getTime() <= t && p.consent === "granted") {
          p.consent = "withdrawn";
          p.consents.push({ action: "withdrawn", method: "whatsapp_reply", source: "customer", at: wa, noticeText: null, body: "STOP" });
          for (const sc of schedules) if (sc.customerId === p.id && sc.status === "pending") sc.status = "cancelled";
        }
      }
    }

    /* Organic and prompted visits due in this hour. */
    for (const p of people) {
      if (p.scripted) continue;
      const inStep = (d: Date | null) => d != null && d.getTime() <= t && d.getTime() > t - STEP;
      const own = inStep(p.nextOrganic) ? p.nextOrganic! : null;
      const nudged = inStep(p.prompted) ? p.prompted! : null;
      /* The earlier of the two wins. A visit is "caused" only when the person
         had no organic visit coming sooner — the question a holdout answers. */
      if (own && (!nudged || own <= nudged)) {
        if (own < NOW) recordVisit(p, own, undefined, "own");
      } else if (nudged) {
        if (nudged < NOW) recordVisit(p, nudged, undefined, p.nextOrganic && p.nextOrganic <= nudged ? "own" : "message");
      }
    }

    /* Reminders due in this hour. */
    for (const s of schedules) {
      if (s.status !== "pending" || s.at.getTime() > t || s.at.getTime() <= t - STEP) continue;
      const p = people.find((x) => x.id === s.customerId)!;
      if (p.consent !== "granted") {
        s.status = "cancelled";
        continue;
      }
      if (recentMessageCount(p.id, s.at) >= MESSAGE_CAP) {
        s.status = "cancelled";
        continue;
      }
      const m = deliver(p, s.at, { scheduleId: s.id, forceRead: p.scripted && s.kind === "at_risk" });
      s.status = m.status === "failed" ? "failed" : "sent";
      s.messageId = m.id;
      if (s.kind !== "thanks") respond(p, m, s.kind);
    }

    /* Campaigns go out at 11am on their day. */
    while (campaignQueue.length) {
      const c = campaignQueue[0];
      const when = at(c.daysAgo, 11, 0);
      if (when.getTime() > t) break;
      campaignQueue.shift();
      runCampaign(c, when);
    }
  }
  refreshMedian();
}

/* ── Write ─────────────────────────────────────────────────────────────── */
async function write() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const M = MERCHANT_ID;

    await client.query(
      `INSERT INTO merchants (id, name, business_name, email, status, item_categories,
                              commission_rate, holdout_percent)
       VALUES ($1, 'Filter Room', 'Filter Room', 'demo@filterroom.in', 'active',
               '["cafe"]'::jsonb, $2, 10.0)
       ON CONFLICT (id) DO UPDATE SET status = 'active', commission_rate = $2,
         holdout_percent = 10.0, name = 'Filter Room', business_name = 'Filter Room',
         address = '14 Kasturi Ranga Road, Alwarpet, Chennai', pincode = '600018',
         item_categories = '["cafe"]'::jsonb,
         customer_message_cap = $3, customer_message_cap_days = $4`,
      [M, COMMISSION_RATE, MESSAGE_CAP, MESSAGE_CAP_DAYS]
    );

    /* Scoped wipe of this one merchant. Order follows the foreign keys. */
    await client.query(`DELETE FROM commission_events WHERE merchant_id = $1`, [M]);
    await client.query(`DELETE FROM message_events WHERE merchant_id = $1`, [M]);
    await client.query(`UPDATE lifecycle_schedules SET sent_message_id = NULL WHERE merchant_id = $1`, [M]);
    await client.query(`UPDATE customer_visits SET attributed_message_id = NULL WHERE merchant_id = $1`, [M]);
    await client.query(`DELETE FROM messages WHERE merchant_id = $1`, [M]);
    await client.query(`DELETE FROM lifecycle_schedules WHERE merchant_id = $1`, [M]);
    await client.query(`DELETE FROM campaign_audiences WHERE campaign_id IN (SELECT id FROM campaigns WHERE merchant_id = $1)`, [M]);
    await client.query(`DELETE FROM campaigns WHERE merchant_id = $1`, [M]);
    await client.query(`DELETE FROM customer_visits WHERE merchant_id = $1`, [M]);
    await client.query(`DELETE FROM consents WHERE merchant_id = $1`, [M]);
    await client.query(`DELETE FROM customers WHERE merchant_id = $1`, [M]);
    await client.query(`DELETE FROM daily_merchant_metrics WHERE merchant_id = $1`, [M]);
    await client.query(`DELETE FROM templates WHERE merchant_id = $1`, [M]);

    /* Templates: the sixteen automatic ones copied from the global set, as
       seed-lifecycle-templates does, plus three the cafe wrote itself. Marked
       approved so the demo can show them sending; a real shop's are not until
       WhatsApp says so. */
    const globals = await client.query(
      `SELECT * FROM templates WHERE is_global = TRUE AND archived_at IS NULL AND lifecycle_day IS NOT NULL`
    );
    const templateId = new Map<string, string>();
    for (const g of globals.rows) {
      const id = randomUUID();
      templateId.set(`${g.visit_group}:${g.lifecycle_day}`, id);
      await client.query(
        `INSERT INTO templates (id, merchant_id, name, category, body, header_text, footer_text, buttons,
           language_code, cta_link, header_image_url, visit_group, lifecycle_day, is_global,
           approval_status, version, source_template_id, source_version, is_locally_modified,
           is_starter_pack, meta_template_name, meta_status, meta_category, meta_submitted_at, meta_synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,FALSE,'approved',1,$14,$15,FALSE,$16,
                 $17,'APPROVED','MARKETING',$18,$18)`,
        [
          id, M, g.name, g.category, g.body, g.header_text, g.footer_text,
          JSON.stringify(g.buttons ?? []), g.language_code, g.cta_link, g.header_image_url,
          g.visit_group, g.lifecycle_day, g.id, g.version, g.is_starter_pack,
          g.meta_template_name ?? g.name, new Date(START.getTime() - 5 * DAY)
        ]
      );
    }
    const CUSTOM: Record<string, { name: string; header: string; body: string; footer: string; discount: boolean; status: string | null; meta: string }> = {
      monsoon: {
        name: "Rainy day filter coffee",
        header: "Rain outside, filter coffee inside",
        body: "Hi {{name}}, it is pouring in Chennai. Come in this week and your filter coffee is on us with any snack at {{shop_name}}.",
        footer: "Valid till Sunday",
        discount: true,
        status: "APPROVED",
        meta: "rainy_day_filter_coffee"
      },
      brunch: {
        name: "New weekend brunch",
        header: "Weekend brunch is here",
        body: "Hi {{name}}, our new weekend brunch starts this Saturday at {{shop_name}} — ghee roast dosa, podi idli and cold brew. See you there?",
        footer: "Sat and Sun, 8 to 12",
        discount: false,
        status: "APPROVED",
        meta: "new_weekend_brunch"
      },
      table: {
        name: "We saved your table",
        header: "Your corner table misses you",
        body: "Hi {{name}}, it has been a while since your last visit to {{shop_name}}. Drop in this week and the first coffee is on us.",
        footer: "Show this message at the counter",
        discount: true,
        status: "APPROVED",
        meta: "we_saved_your_table"
      },
      diwali: {
        name: "Diwali sweets box",
        header: "Diwali sweets, made here",
        body: "Hi {{name}}, {{shop_name}} is making Diwali sweet boxes this year. Reply to pre-order yours before 15 October.",
        footer: "Limited boxes",
        discount: false,
        status: "PENDING",
        meta: "diwali_sweets_box"
      }
    };
    for (const [key, t] of Object.entries(CUSTOM)) {
      const id = randomUUID();
      templateId.set(key, id);
      await client.query(
        `INSERT INTO templates (id, merchant_id, name, category, body, header_text, footer_text, buttons,
           language_code, is_global, approval_status, is_discount_offer, meta_template_name, meta_status,
           meta_category, meta_submitted_at, meta_synced_at)
         VALUES ($1,$2,$3,'cafe',$4,$5,$6,'[]'::jsonb,'en',FALSE,'approved',$7,$8,$9,'MARKETING',$10,$10)`,
        [id, M, t.name, t.body, t.header, t.footer, t.discount, t.meta, t.status, new Date(NOW.getTime() - 70 * DAY)]
      );
    }

    /* Customers, their consent trail, and visits. */
    const segCounts: Record<string, number> = {};
    for (const p of people) {
      if (!p.visits.length) continue;
      const last = p.visits[p.visits.length - 1];
      const seg = segNow(p, NOW);
      segCounts[seg.segment] = (segCounts[seg.segment] ?? 0) + 1;
      const total = p.visits.reduce((s, v) => s + v.amount, 0);
      await client.query(
        `INSERT INTO customers (id, merchant_id, name, mobile, location, pincode, age, date_of_birth,
           total_spend, total_visits, last_visit, whatsapp_opt_in, lifecycle_tier, segment,
           expected_gap_days, expected_revisit_at, segment_updated_at, consent_state,
           consent_updated_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5::text,$5::varchar,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),$16,$17,$18,NOW())`,
        [
          p.id, M, p.name, p.mobile, p.pincode, p.age, p.dob, total, p.visits.length, last.at,
          p.consent !== "withdrawn", Math.min(p.visits.length, 4), seg.segment,
          seg.expectedGapDays, seg.expectedRevisitAt, p.consent,
          p.consents.length ? p.consents[p.consents.length - 1].at : null, p.visits[0].at
        ]
      );
      for (const c of p.consents) {
        await client.query(
          `INSERT INTO consents (merchant_id, customer_id, action, method, source, notice_text,
             notice_version, evidence, occurred_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
          [
            M, p.id, c.action, c.method, c.source, c.noticeText,
            c.noticeText ? "counter-v1" : null,
            JSON.stringify({ seededBy: "seed-cafe-simulation.ts", ...(c.body ? { body: c.body } : {}) }),
            c.at
          ]
        );
      }
      for (const v of p.visits) {
        await client.query(
          `INSERT INTO customer_visits (id, merchant_id, customer_id, billing_amount, visit_at,
             age_at_visit, is_repeat_visit, return_type, attribution_window_days, segment_at_visit,
             attributed_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,7,$9,$5,$5)`,
          [v.id, M, p.id, v.amount, v.at, p.age, !v.isFirst, v.returnType, v.segmentAtVisit]
        );
      }
    }

    /* Campaigns and who was in each arm. */
    for (const c of CAMPAIGNS) {
      if (!c.sentAt || !c.audience) continue;
      const treat = c.audience.filter((a) => a.arm === "treatment");
      const campMsgs = messages.filter((m) => m.campaignId === c.id);
      await client.query(
        `INSERT INTO campaigns (id, merchant_id, template_id, campaign_name, status, target_count,
           sent_count, delivered_count, failed_count, audience_rules, holdout_percent_used,
           holdout_count, treatment_count, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'sent',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          c.id, M, templateId.get(c.templateKey), c.name, treat.length,
          campMsgs.length, campMsgs.filter((m) => m.deliveredAt).length,
          campMsgs.filter((m) => m.status === "failed").length,
          JSON.stringify({ segments: c.segments, ...(c.overdueOnly ? { overdueOnly: true } : {}) }),
          c.holdoutPercentUsed, c.audience.length - treat.length, treat.length,
          new Date(c.sentAt.getTime() - 40 * 60_000),
          /* The lift query reads updated_at as the send time. */
          c.sentAt
        ]
      );
      for (const a of c.audience) {
        const p = people.find((x) => x.id === a.id)!;
        await client.query(
          `INSERT INTO campaign_audiences (campaign_id, customer_id, mobile, arm, dispatch_status,
             dispatch_attempted_at, dispatch_note, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [c.id, a.id, p.mobile, a.arm, a.status, a.arm === "treatment" ? c.sentAt : null, a.note, c.sentAt]
        );
      }
    }

    /* Lifecycle schedules (need their visit and template), then messages. */
    for (const s of schedules) {
      const tid = templateId.get(`${s.group}:${s.day}`);
      if (!tid) continue;
      await client.query(
        `INSERT INTO lifecycle_schedules (id, merchant_id, customer_id, visit_id, visit_group,
           lifecycle_day, template_id, scheduled_at, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [s.id, M, s.customerId, s.visitId, s.group, s.day, tid, s.at, s.status,
         new Date(s.at.getTime() - (s.day === "day_0" ? 5 * 60_000 : 0))]
      );
    }
    for (const m of messages) {
      await client.query(
        `INSERT INTO messages (id, merchant_id, customer_id, campaign_id, provider, provider_message_id,
           status, delivered_at, opened_at, created_at, updated_at, lifecycle_schedule_id)
         VALUES ($1,$2,$3,$4,'cloud_api',$5,$6,$7,$8,$9,$10,$11)`,
        [
          m.id, M, m.customerId, m.campaignId, `wamid.SIMULATED.${m.id}`, m.status,
          m.deliveredAt, m.openedAt, m.createdAt, m.openedAt ?? m.deliveredAt ?? m.createdAt, m.scheduleId
        ]
      );
    }
    for (const s of schedules) {
      if (s.messageId) {
        await client.query(`UPDATE lifecycle_schedules SET sent_message_id = $1 WHERE id = $2`, [s.messageId, s.id]);
      }
    }

    /* Attribution links and the commission ledger. */
    const monthStart = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
    const lastMonthStart = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1);
    for (const p of people) {
      for (const v of p.visits) {
        if (v.returnType !== "custva_influenced") continue;
        await client.query(`UPDATE customer_visits SET attributed_message_id = $1 WHERE id = $2`, [v.attributedMessageId, v.id]);
        const status = v.at >= monthStart ? "pending" : v.at >= lastMonthStart ? "invoiced" : "paid";
        await client.query(
          `INSERT INTO commission_events (merchant_id, visit_id, customer_id, attributed_message_id,
             influenced_amount, commission_rate, commission_amount, status, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [M, v.id, p.id, v.attributedMessageId, v.amount, COMMISSION_RATE,
           Number((v.amount * COMMISSION_RATE).toFixed(2)), status, v.at]
        );
      }
    }

    /* Daily rollup, from the rows just written, by the shop's calendar day. */
    await client.query(
      `INSERT INTO daily_merchant_metrics (merchant_id, metric_date, new_customers, visits, revenue,
         retention_revenue, organic_repeat_revenue, influenced_revenue, influenced_visits)
       SELECT $1, visit_at::date,
              COUNT(*) FILTER (WHERE NOT is_repeat_visit),
              COUNT(*),
              SUM(billing_amount),
              COALESCE(SUM(billing_amount) FILTER (WHERE is_repeat_visit), 0),
              COALESCE(SUM(billing_amount) FILTER (WHERE is_repeat_visit AND return_type = 'organic'), 0),
              COALESCE(SUM(billing_amount) FILTER (WHERE return_type = 'custva_influenced'), 0),
              COUNT(*) FILTER (WHERE return_type = 'custva_influenced')
         FROM customer_visits WHERE merchant_id = $1
        GROUP BY visit_at::date`,
      [M]
    );
    await client.query(
      `WITH m AS (
         SELECT created_at::date AS d, COUNT(*) AS sent,
                COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
                COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS read
           FROM messages WHERE merchant_id = $1 GROUP BY 1)
       INSERT INTO daily_merchant_metrics (merchant_id, metric_date, messages_sent, messages_delivered, messages_read)
       SELECT $1, d, sent, delivered, read FROM m
       ON CONFLICT (merchant_id, metric_date) DO UPDATE SET
         messages_sent = EXCLUDED.messages_sent,
         messages_delivered = EXCLUDED.messages_delivered,
         messages_read = EXCLUDED.messages_read`,
      [M]
    );

    await client.query(
      `UPDATE merchants SET median_gap_days = $2, median_gap_updated_at = NOW() WHERE id = $1`,
      [M, merchantMedian]
    );

    await client.query("COMMIT");

    const influenced = people.flatMap((p) => p.visits).filter((v) => v.returnType === "custva_influenced");
    const allVisits = people.flatMap((p) => p.visits);
    console.log(`Filter Room — ${HORIZON_DAYS} days simulated`);
    console.log(`  customers        ${people.filter((p) => p.visits.length).length}`);
    console.log(`  visits           ${allVisits.length}  (₹${allVisits.reduce((s, v) => s + v.amount, 0).toLocaleString("en-IN")})`);
    console.log(`  messages         ${messages.length}  (${messages.filter((m) => m.campaignId).length} from campaigns)`);
    console.log(`  brought back     ${influenced.length} visits  ₹${influenced.reduce((s, v) => s + v.amount, 0).toLocaleString("en-IN")}  (the product's last-touch rule)`);
    const caused = allVisits.filter((v) => v.cause === "message");
    const creditedCaused = influenced.filter((v) => v.cause === "message");
    console.log(`  truly caused     ${caused.length} visits  ₹${caused.reduce((s, v) => s + v.amount, 0).toLocaleString("en-IN")}  (simulation ground truth)`);
    console.log(`  credited & caused ${creditedCaused.length} of ${influenced.length} credited visits`);
    console.log(`  segments now     ${JSON.stringify(segCounts)}`);
    console.log(`  consent          ${JSON.stringify(people.reduce((a, p) => (p.visits.length ? ((a[p.consent] = (a[p.consent] ?? 0) + 1), a) : a), {} as Record<string, number>))}`);
    for (const c of CAMPAIGNS) {
      console.log(`  campaign "${c.name}": ${c.audience?.filter((a) => a.arm === "treatment").length} messaged, ${c.audience?.filter((a) => a.arm === "holdout").length} held out`);
    }
    console.log(`  merchant median gap ${merchantMedian?.toFixed(1)}d`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }
}

simulate();
if (process.env.SIM_DRY_RUN === "1") {
  /* Simulate and report without touching the database. */
  const visits = people.flatMap((p) => p.visits);
  const credited = visits.filter((v) => v.returnType === "custva_influenced");
  const caused = visits.filter((v) => v.cause === "message");
  const sum = (xs: VisitRec[]) => xs.reduce((a, v) => a + v.amount, 0);
  console.log(JSON.stringify({
    customers: people.filter((p) => p.visits.length).length,
    visits: visits.length,
    credited: credited.length, creditedRs: sum(credited),
    caused: caused.length, causedRs: sum(caused),
    creditedAndCaused: credited.filter((v) => v.cause === "message").length,
    creditedFirstTime: credited.filter((v) => v.segmentAtVisit === "first_time").length,
    creditedAtRisk: credited.filter((v) => v.segmentAtVisit === "at_risk").length,
    creditedDormant: credited.filter((v) => v.segmentAtVisit === "dormant").length
  }));
} else {
  await write();
}
