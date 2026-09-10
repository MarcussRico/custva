# Custva — working state

**Read this first when resuming.** It is the single place that says what is done,
what is half-done, and what to pick up next. Update it at the end of any working
session; do not let it drift.

| | |
|---|---|
| **Last updated** | 2026-09-11 |
| **Current phase** | **All phases complete (0, A, B, C, M, D, E).** The SRS is built, plus holdout measurement |
| **Next action** | **Stop building.** Get Meta credentials and a pilot merchant — every remaining gap needs reality, not code |
| **Blocking** | No write access to `Madan94/custva`; nothing is committed anywhere |
| **Decision needed** | Shared vs per-merchant WhatsApp number (§6). Blocks SRS schema work |

---

## 1. Resume in sixty seconds

```bash
cd ~/projects/custva
corepack pnpm install                       # or: npx pnpm@10.8.1 install
# Docker is NOT installed on this machine. Postgres 16 runs via Homebrew instead:
#   brew services start postgresql@16
# Redis is still needed for BullMQ (worker/campaigns) — not yet installed.
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/custva"
pnpm db:migrate && pnpm db:seed && pnpm db:seed-lifecycle
pnpm dev:api & pnpm dev:worker & pnpm dev:web-merchant &
```

Live deployments (frontend only, no API behind them):

- https://custva-web.vercel.app
- https://custva-admin.vercel.app/login

Authoritative documents, in reading order:

| Document | What it is |
|---|---|
| `PROGRESS.md` | This file — state and next actions |
| `Feature-Implementation.md` | **The SRS.** Segmentation, attribution, commission. The requirements baseline |
| `REDESIGN.md` | What changed in the frontend, and why |
| `HANDOVER.md` | Env matrix, runbook, deploy shape |
| Code review artifact | https://claude.ai/code/artifact/00b87549-8535-4c28-81aa-beefb0e0b951 — 12 defects, all independently re-verified here |
| `README.md` | Full architecture; §18 is the honest limitations list |

---

## 2. Done

### Frontend redesign — complete, deployed, unverified by anyone but us

Landing page, merchant login and admin login rebuilt. 13 bugs found and fixed,
including three that failed silently (dead Tailwind utilities, invisible content
after a fast scroll, and the display typeface never applying). Full detail in
`REDESIGN.md`.

Thirteen unsupported marketing claims were removed. **The same class of claim
still exists in the product** — see §3.

### Backend — unchanged

No API, worker, or schema changes have been made. Everything below is as
Madan94 left it.

---

## 3. Verified current state of the backend

Checked against the code on 2026-09-11. `Feature-Implementation.md` §16 has its
own gap table; this one is verified and supersedes it where they differ.

| Capability | State | Where |
|---|---|---|
| Visit capture with timestamp + amount | ✅ Built | `customer_visits` |
| Repeat-visit flag | ✅ Built | `customer_visits.is_repeat_visit` |
| Lifecycle scheduling, 4 tiers × 4 days | ✅ Built | `lifecycle_schedules`, `lifecycle-service.ts` |
| Campaign dispatch via BullMQ | ✅ Built | `apps/worker` |
| **Message delivery / read tracking** | ✅ Built | `messages.delivered_at`, `.opened_at`, written by the WhatsApp webhook |
| **Unified message log (campaign + lifecycle)** | ✅ Built | `messages.campaign_id` is nullable; lifecycle rows carry `lifecycle_schedule_id` |
| Admin audit log | ✅ Built | `admin_audit_logs`, `writeAudit` |
| Expected revisit prediction | ❌ Missing | — |
| Four-segment classification | ❌ Missing | `customers.lifecycle_tier` is visit-count only, not behaviour |
| Visit ↔ message link | ❌ Missing | — |
| Organic vs influenced split | ❌ Missing | — |
| Commission ledger | ❌ Missing | — |
| Holdout / control group | ❌ Missing | Not in the SRS either — see §5 |

**Good news:** the two hardest inputs already exist. Delivery and read
timestamps are being captured, and both campaign *and* lifecycle sends land in
one `messages` table. Attribution has everything it needs to read from; nothing
needs re-plumbing.

### An overclaim that is live in the product right now

`daily_merchant_metrics.retention_revenue` sums **every** repeat visit. The
merchant dashboard presents it as retention value. That is precisely the claim
the SRS says must not be made (`§16`: *"may remain as a secondary metric but
shall not be labeled as CUSTVA-generated revenue"*), and it is the same failure
mode as the marketing claims already removed from the landing page. It should be
relabelled the moment the organic/influenced split lands — ideally sooner.

---

## 3b. Defects — verified, blocking

From the 8 Sep code review artifact. **I re-checked every claim below against the
code myself; all six I spot-checked were accurate.** Severity is production
consequence, not code quality.

### P0 — fix before any SRS work, and before any real customer is messaged

| # | Defect | Verified how |
|---|---|---|
| 1 | **Cross-merchant data leak in the audience builder.** `buildAudienceQuery` puts `OR c.id = ANY($n::uuid[])` *outside* the `merchant_id` + `whatsapp_opt_in` scope, and `manualIncludeIds` is only validated as "is a UUID", never as "belongs to this merchant". Another merchant's customers can be previewed and messaged — and opted-out customers get messaged too | Read `audience-engine.ts:118-129`. The `ruleMatch` string carries the scope; the OR branch sits outside the parenthesised group |
| 2 | **Every lifecycle delivery receipt throws.** `message_events.campaign_id` is `NOT NULL REFERENCES campaigns(id)` (migration 0004, never altered). Migration 0011 made `messages.campaign_id` nullable and the worker writes `NULL` for lifecycle sends. The webhook copies that NULL straight into `message_events` | Read `0004_auth_events.sql`, confirmed no later `ALTER`; read `webhooks/routes.ts:92-98` and `worker/index.ts:366` |
| 3 | **Any unhandled rejection kills the API.** Express 4.21, no `express-async-errors`, no `asyncHandler` wrapper anywhere. `customers/routes.ts` alone has **8 async handlers and 0 try blocks** | Grepped for the package and for wrappers — neither exists. Counted handlers vs try blocks |

Defects 2 and 3 compose: one lifecycle delivery receipt from Meta can take the
whole API process down.

### P1 — before a pilot

| # | Defect |
|---|---|
| 4 | **Webhooks are not idempotent.** Meta redelivers on any non-2xx or timeout; each redelivery re-inserts a `message_events` row and re-increments `campaigns.delivered_count` and `daily_merchant_metrics.messages_delivered`. Those inflated numbers are what the dashboard shows — and, once the SRS lands, an input to commission |
| 5 | **A failed batch re-sends.** One BullMQ job carries a whole recipient list with `attempts: 5`. Send failures are caught per-recipient, but a DB error is not — so a failure at recipient 40 replays recipients 1-39, up to five times. Real money, and duplicate marketing messages are what destroy a number's quality rating |
| 6 | **Template approval is a local flag with no relationship to Meta.** The only Graph endpoint touched is `/messages`. `approval_status = 'approved'` means someone clicked in the Custva admin. Worse, the name sent to Meta is the free-text merchant-facing `templates.name` ("Brownie Day 3"); Meta requires lowercase snake_case, pre-approved on that WABA. **With real credentials today, essentially every send fails.** This is the single thing between this repo and a working pilot |
| 7 | **Consent cannot be proven.** `whatsapp_opt_in BOOLEAN NOT NULL DEFAULT TRUE`, hardcoded `TRUE` on insert. No timestamp, no method, no record of wording shown, no revocation path. The webhook reads `statuses` only and ignores `messages`, so a customer replying STOP is invisible. Meta requires explicit opt-in; DPDP requires it recorded and revocable |

### P2 / P3

| # | Defect |
|---|---|
| 8 | Send quotas model a daily cap, not Meta's actual rolling-24h unique-recipient tier; no pacing (concurrency 10, batch drains as fast as it can) |
| 9 | `analytics_projection_queue` is dead code that double-increments the same delivery counters the webhook already writes. Harmless until someone wires it up |
| 10 | The "birthday month" filter is `EXTRACT(MONTH FROM c.created_at)` — the signup month. There is no date-of-birth column, only a static `age` that goes stale yearly |
| 11 | Dev auth bypass checks only that `CUSTVA_DEV_MERCHANT_ID` is *set*, never that the header equals it. On any shared staging box, `x-dev-merchant-id` impersonates any merchant |
| 12 | Zero test files. `pnpm test` passes vacuously, so CI reports green — worse than no CI, because it looks like coverage. **Fixed** — 6 real tests now run under `pnpm -r test` |
| 13 | **`pnpm db:migrate` had never worked.** `scripts/run-migrations.mjs` is plain JavaScript but contained two TypeScript generics (`client.query<{ filename: string }>`), which parse as a comparison and throw `ReferenceError: string is not defined` before a single migration is applied. Step 6 of the HANDOVER runbook failed for anyone who tried it. Not in the 8 Sep review — found while running it. **Fixed** |

---

## 4. Backend plan

Phases are ordered so each one is independently useful and independently
verifiable. Status column is the thing to keep current.

**The ordering changed** once the defects in §3b were verified. Attribution and
commission are built on the audience engine, the message log and the delivery
receipts — all three of which are currently broken. Building segmentation on top
of that would mean computing commission from inflated delivery counts, on an API
that falls over when a lifecycle receipt arrives.

### Phase 0 — Stop the bleeding (days, not weeks)

| # | Task | Status |
|---|---|---|
| 0.1 | Move the OR branch inside the merchant + opt-in scope; validate `manualIncludeIds` ownership server-side before storing (defect 1) | ✅ |
| 0.2 | Migration `0013`: drops the `NOT NULL`, adds `lifecycle_schedule_id` (defect 2) | ✅ applied + proven |
| 0.3 | `import "express-async-errors"` at the top of `server.ts` (defect 3) | ✅ |
| 0.4 | Webhook idempotency — unique index in `0013`, `ON CONFLICT DO NOTHING`, every counter gated on first-sight (defect 4) | ✅ applied + proven |
| 0.5 | First tests — 6 on the audience query builder. Segment rules follow in Phase A | ✅ |
| 0.6 | **Fixed the migration runner itself** — `scripts/run-migrations.mjs` is `.mjs` but contained TypeScript generics, so `pnpm db:migrate` threw `ReferenceError: string is not defined` before applying anything. See defect 13 | ✅ |

**Done when:** a lifecycle delivery receipt round-trips without throwing, a
merchant cannot select another merchant's customer, and there is a failing test
if either regresses.

**Status — 2026-09-11.** All five tasks are coded, typechecked and building.

*What was verified:* the six new tests pass, and — more usefully — I reintroduced
the original bug and confirmed **3 of the 6 fail**, exactly the three that
matter (merchant scope, consent, exclusion precedence). A test that has never
been seen to fail proves nothing. `pnpm -r test` now runs 6 real assertions
where CI previously passed on an `echo`.

*Verified against a real database.* Docker is not installed on this machine, so
Postgres 16.15 was installed via Homebrew instead and all 13 migrations applied
cleanly — 18 tables, 16 global lifecycle templates seeded.

Both defects were then proven, not assumed, using the same discipline as the
unit tests — build the broken state first and watch it fail:

| | Pre-0013 schema | Post-0013 |
|---|---|---|
| Lifecycle receipt, `campaign_id NULL` | `ERROR: null value in column "campaign_id" ... violates not-null constraint` | `INSERT 0 1` |
| Meta redelivers the identical event | second row stored, counters double | `INSERT 0 0`, one row, counters move once |
| A genuinely different event type | — | still allowed (`delivered` + `read` both stored) |

The pre-0013 database was built by applying `0001`–`0012` only into a scratch
database, reproducing the exact failure, then dropping it.

*Also fixed in passing:* the campaign `delivered_count` / `failed_count`
increments were unconditional on `message.campaign_id`, which is NULL for every
lifecycle message. Both are now guarded. And `*.test.ts` is excluded from the
build so tests do not ship in `dist`.

### Phase A — Segmentation foundation

| # | Task | Status |
|---|---|---|
| A1 | Migration `0013`: `customers.segment`, `expected_gap_days`, `expected_revisit_at`, `segment_updated_at` | ☐ |
| A2 | `expected_gap_days` cascade — own median → merchant median → 14 | ✅ |
| A3 | Classifier on the FR-S3 thresholds, plus `explainSegment` for NFR-1 | ✅ |
| A4 | Recompute inside the visit-write transaction | ✅ |
| A5 | Hourly sweep in the worker (`setInterval`, no Redis needed) | ✅ code · ⚠️ unrun, needs the worker up |
| A6 | `segment`, `expectedGapDays`, `expectedRevisitAt`, `segmentUpdatedAt` on the customer API | ✅ |

**Done when:** a customer with a 7-day rhythm who has not been in for 12 days
shows as At-Risk, with the reason readable in plain language.

**Status — 2026-09-11. Done, and verified against real Postgres:**

```
PASS  weekly regular, came in 5 days ago   -> loyal       (gap 7.0d)
      "Comes in roughly every 7 days and it has been 5 — they are on schedule."
PASS  same person, 12 days — missed one    -> at_risk     (gap 7.0d)
      "Usually back within 7 days, but it has been 12. They have missed their normal visit."
PASS  same person, 30 days — long gone     -> dormant     (gap 7.0d)
PASS  been in exactly once                 -> first_time  (gap 14.0d fallback)
PASS  no new visit, 20 more days pass      -> loyal became dormant
INFO  merchant median gap cached: 7.0 days
```

The last line is the one that matters. At-Risk and Dormant are states a customer
enters by doing *nothing*, so the transition was tested with no new visit
written — which is exactly what FR-S4 exists to catch and the easiest thing to
leave out.

**Where the code lives.** The rules are pure and live in `packages/shared`
(`segmentation.ts`, 21 tests), so the API's visit-write path and the worker's
sweep call one implementation and cannot drift. `apps/api/src/lib/segmentation-service.ts`
is the DB-facing half.

**Two design notes:**

- The merchant median (FR-S2's middle fallback) needs a window function over
  every visit for that merchant — too expensive for the POS write path
  (NFR-3). It is cached on `merchants.median_gap_days` and refreshed by the
  sweep. NULL is safe: the cascade falls through to 14 days.
- Visit history is read `LIMIT 30`. A customer with 400 visits does not need all
  400 read on every write, and their rhythm two years ago is not evidence about
  their rhythm today.

**A spec gap found while implementing.** FR-S3 requires `total_visits >= 3` for
Loyal and `> 1.25x` for At-Risk — so a customer with exactly **2 visits who is
on time matches no rule at all**. §14's business-rule summary does not cover it
either. We classify them `loyal`, deliberately: Loyal is the segment that gets
no discount (BR-2) and generates no commission (FR-A5), so an ambiguous customer
is never billed for. It is a product decision, not an engineering one — see §6.

**Not yet run:** the sweep itself. It is an hourly `setInterval` in the worker,
mirroring the existing lifecycle reconcile loop, so it needs no Redis — but the
worker has not been started on this machine. The same logic was exercised
directly against the database in the run above.

### Phase B — Attribution

| # | Task | Status |
|---|---|---|
| B1 | Migration `0016`: `return_type`, `attributed_message_id`, `attribution_window_days`, `segment_at_visit`, `attributed_at` | ✅ applied |
| B2 | Last-touch inside the window, `COALESCE(opened_at, delivered_at)` per FR-A3 | ✅ |
| B3 | Loyal shield — organic even with a delivered message | ✅ verified |
| B4 | Message link + window + segment-at-visit stored; `explainVisitAttribution` reconstructs it | ✅ |

**Done when:** an influenced visit can be traced to the exact message and window
that earned the label, and a Loyal regular returning after a message is still
organic.

**Status — 2026-09-11. Done, verified against real Postgres:**

```
PASS  at-risk, message read 2 days ago             was:at_risk  -> custva_influenced
PASS  LOYAL regular, message read 1 day ago        was:loyal    -> organic
PASS  at-risk, no message at all                   was:at_risk  -> organic
PASS  at-risk, message 9 days ago (outside window) was:at_risk  -> organic
PASS  dormant win-back, delivered 4 days ago       was:dormant  -> custva_influenced
```

Every row also stores `segment_at_visit`, the window applied, and the message
link, so the decision is reconstructible without recomputing it (NFR-2, NFR-4).

### The ordering trap — the subtle part of this phase

Recording a visit is *exactly what makes a customer look loyal*. If attribution
reads the segment after the rollup, FR-A5's shield fires on nearly every return
and the product never attributes anything. Demonstrated on real data:

```
segment BEFORE the return is recorded : at_risk
segment AFTER  the return is recorded : loyal

  using BEFORE -> shield does not fire -> custva_influenced  (correct)
  using AFTER  -> shield fires         -> organic            (wrong)
```

So the visit-write transaction captures the segment at the *top*, before the
rollup, and attribution runs before the segment recompute. The ordering is
load-bearing and is commented as such in `customers/routes.ts`.

**Honest framing of what this is.** Last-touch attribution is correlation. A
customer who was always coming back on Tuesday, who happened to receive a
message on Sunday, is counted as influenced. The Loyal shield reduces that error
but does not measure it. The `arm` column added in `0014` is what eventually
turns this into a causal number — see §5.

### Phase C — Intervention policy (this is the "stop wasting messages" phase)

| # | Task | Status |
|---|---|---|
| C1 | `segments` + `overdueOnly` filters on the audience engine and customer list | ✅ |
| C2 | Loyal shield enforced in `POST /campaigns/:id/send`, with an explicit `include_loyal_override` | ✅ verified |
| C3 | Rhythm-based scheduling for returning customers; fixed grid kept for first visits | ✅ verified |
| C4 | Per-customer cap (default 4 / 7 days) on both send paths | ✅ verified |

**Note on C3.** This is the change you described as tapping the *repetition
missing* basis, and it is the single biggest lever on message spend. Today
every customer gets four messages per visit regardless of behaviour. Under C3, a
weekly regular who shows up on time gets **none** — there is nothing to fix —
while the one who missed their Friday gets a single, well-timed message. Fewer
sends, better targeted, and lower Meta conversation spend.

The existing day 0/3/7/14 grid stays for First-Time nurture, where there is no
rhythm to measure yet.

**Status — 2026-09-11. Done, verified against real Postgres:**

```
FIRST VISIT (no rhythm known)   day_0@+0d  day_3@+3d  day_7@+7d  day_14@+14d
WEEKLY REGULAR (gap 7d)         day_0@+0d  day_7@+8.7d  day_14@+17.5d
MONTHLY CUSTOMER (gap 30d)      day_0@+0d  day_7@+37.5d  day_14@+75d
```

The monthly row is the whole point. Under the fixed grid that customer was
nudged at +3d, +7d and +14d *while perfectly on schedule* — three messages
telling someone who is not late that they are missed. Now the first nudge waits
until day 37.5, which is when they have actually broken their own pattern.

**Message reduction for a customer who returns on schedule:**

| | old fixed grid | rhythm | cut |
|---|---|---|---|
| Weekly regular (returns day 7) | 2 | 1 | 50% |
| Monthly customer (returns day 30) | 4 | 1 | 75% |

The nudges do not fire at all for anyone who comes back on time —
`cancelPendingLifecycleSchedules` removes them on the next visit. That is the
intended outcome, not a gap: there is nothing to fix for a customer who is not
late.

The day_7 and day_14 templates are reused for the two nudges because their
seeded wording already fits the moment ("A week since we met", "We miss you").
Only the timing changed, so no new copy is needed.

**C2 and C4, verified:**

```
audience before shield         : at_risk, dormant, loyal
discount template, no override : at_risk, dormant   (1 loyal withheld)
non-discount template          : at_risk, dormant, loyal

frequency cap (2 per 7 days)
  attempt 1: 0 sent in 7d -> SEND
  attempt 2: 1 sent in 7d -> SEND
  attempt 3: 2 sent in 7d -> SKIPPED by cap
```

The per-merchant quota (500/day) never protected an individual — one customer
could receive every message a merchant sent. Meta's quality rating is driven by
individual recipients blocking and reporting, so the per-person cap is the one
that protects the sending number.

**A second ordering dependency.** Lifecycle enrolment now runs *last* in the
visit transaction, because the rhythm schedule reads the `expected_gap_days`
that the segment recompute just refreshed. Scheduling earlier would time this
visit's nudges off the previous visit's rhythm. The transaction order is now
attribute → recompute → enrol, and each step is commented with why.

### Phase M — Meta template integration (hard gate for any real send)

| # | Task | Status |
|---|---|---|
| M1 | Migrations `0018` + `0019`: `meta_template_name`, `meta_status`, `meta_category`, `meta_rejected_reason`, `meta_template_id`, `header_image_handle`; all 16 seeded templates backfilled with valid names | ✅ |
| M2 | `createTemplate` + `fetchTemplateStatus` on the adapter, and three admin routes: validate-for-meta, submit-to-meta, sync-meta-status | ✅ code · ⚠️ unexercised, no credentials |
| M3 | Both send paths gated — campaign route refuses before queueing, lifecycle fails the schedule with a readable reason | ✅ |
| M4 | `header_image_handle` column and IMAGE header components. **The upload flow that produces a handle is not built** | ⚠️ partial |

**Status — 2026-09-11.**

The real fix is the body conversion. Meta requires positional placeholders;
Custva stores readable named ones:

```
body stored     : Hi {{name}}, thanks for your first visit! ...
body registered : Hi {{1}}, thanks for your first visit! ...
variable order  : [name]   <- the worker already sends parameters in this order
```

That ordering is not a coincidence — `extractBodyVariables` in the worker
already resolves named tokens positionally by first appearance, so the
registered body and the sent parameters line up by construction.

The 16 seeded templates were already snake_case, so the *name* conversion is a
no-op for them. The name problem bites merchant-created templates, which are
free text from the create-template modal ("Weekend offer" → `weekend_offer`).

**Pre-submission validation.** Meta's review is slow and its rejection reasons
terse, so `validateTemplateForMeta` catches the structural rules first:

```
good copy               -> submittable
starts with a variable  -> Body cannot start with a variable. Put a word before it.
ends with a variable    -> Body cannot end with a variable. Put a word after it.
adjacent variables      -> Two variables cannot sit next to each other.
```

**The gate.** All 16 templates currently read `meta_status = NULL`, so every one
is blocked at send. That is correct: none has been submitted, and none now
claims an approval it does not have. `approval_status` is commented in the
schema as Custva-internal so nobody mistakes it for Meta's again.

**What is NOT verified.** No Meta credentials exist on this machine, so
`createTemplate` and `fetchTemplateStatus` have never run against Graph. The
payload shape is unit-tested and the code paths typecheck, but the first real
submission is where Meta's actual opinion arrives. Needs `WA_ACCESS_TOKEN` and
the new `WA_BUSINESS_ACCOUNT_ID`.

**M4 is only half done.** The schema and the IMAGE component are in place, but
Meta needs a *handle* from its resumable upload API at registration time, not a
URL — and nothing uploads. So "a picture on every message", which the landing
page now promises, still has no path from a merchant's photo to an approved
template. This is the largest remaining gap between the marketing and the
product.

### Phase D — Metrics and commission

| # | Task | Status |
|---|---|---|
| D1 | `organic_repeat_revenue`, `influenced_revenue`, `influenced_visits` on the daily rollup | ✅ verified |
| D2 | Dashboard KPI renamed "Retention revenue" → "Repeat revenue today"; API field renamed to `todayRepeatRevenue` | ✅ |
| D3 | `commission_events`, one immutable row per influenced visit, unique on `visit_id` | ✅ verified |
| D4 | "Brought back by Custva · 30 days" beside repeat revenue, never summed together | ✅ |

**Status — 2026-09-11. Verified against real Postgres, four visits, 8% rate:**

```
was:at_risk -> custva_influenced      organic repeat revenue    : ₹700
was:loyal   -> organic                Custva-influenced revenue : ₹1,100 (2 visits)
was:at_risk -> organic
was:dormant -> custva_influenced      commission rows : 2  base ₹1,100  @8% = ₹88
```

The old single "retention revenue" number for that same day would have read
**₹1,800**, presented as though Custva produced all of it. It produced ₹1,100 of
it, and only that half is billable.

**NFR-4 immutability, tested by attacking it.** The merchant's rate was raised
from 8% to 20% *after* the events were written; historical commission stayed at
₹88. The rate is copied into each row at write time rather than joined at read
time, so changing a rate tomorrow cannot silently restate invoices already
issued. Corrections require an explicit adjustment row.

**FR-M5** holds by construction: organic visits create no commission row at all,
not a zero row, so the ledger contains only what is genuinely billable.

### Phase E — Proof of causation ✅

| # | Task | Status |
|---|---|---|
| E1 | Migration `0021`: `merchants.holdout_percent`, per-campaign `holdout_percent_used` / `holdout_count` / `treatment_count` | ✅ applied |
| E2 | Deterministic assignment seeded on (campaign, customer) | ✅ verified |
| E3 | Only the treatment arm is queued; holdout recorded and left alone | ✅ |
| E4 | `GET /campaigns/:id/lift` — return rates per arm, lift, z score, plain-language verdict | ✅ |

**Status — 2026-09-11.**

```
audience 820 (520 influenceable, 300 loyal)
  treatment 806   holdout 14 -> after the hash fix, ~52
  loyal customers held out: 0        <- holding a regular back measures nothing
  retried send produces the same split: true
```

**Refusing to overclaim** is most of the value here:

```
tiny sample     lift = not reported   "Too few customers to measure lift yet (12 messaged, 3 held out…)"
no holdout      lift = not reported   "No holdout was assigned, so there is nothing to compare against."
noise not lift  lift = 3 pts          "…within normal variation for this sample size. Treat it as unproven."
small cafe      holdout = 0           "Only 45 customers could be influenced; a holdout needs at least 100."
```

A small cafe gets **no holdout at all** — holding back 4 of 45 customers costs
real returns and produces a number one visit could swing by 25 points. The
feature declines to run rather than produce a figure that looks precise and
is not.

### A bug found by checking the arithmetic

The first implementation held out **14 of 520** when asked for 10% — a
systematically undersized holdout, which would have biased every lift number
computed from it. Cause: FNV-1a leaves the high bits poorly mixed for short,
near-identical keys, and every key here is near-identical by construction
(`camp:cust-1`, `camp:cust-2`…). Adding murmur3's finaliser fixed the
avalanche:

| n | before | after | ±3σ band |
|---|---|---|---|
| 520 | 2.7% | 7.9% | 6.1–13.9% |
| 1,000 | — | 9.3% | 7.2–12.8% |
| 10,000 | — | 10.1% | 9.1–10.9% |

The regression test uses a **±3 binomial standard deviation** tolerance rather
than a flat band: a random split of 200 people genuinely varies more than one of
10,000, and a fixed ±3pt band would have failed correct behaviour at small n
while passing broken behaviour at large n. My first version of that test made
exactly that mistake.

---

## 5. Proposal — holdout groups

**The problem with Phase B on its own.** Last-touch attribution says *"they got
a message, then they came back."* A merchant can answer: *"they'd have come back
anyway."* That is the exact objection the SRS opens with (§2.1), and last-touch
cannot actually refute it — it is correlation. The Loyal shield (FR-A5) is a
proxy for the problem, not an answer to it.

**The proposal.** Hold back a small random share of At-Risk customers — say 10%
— and send them nothing. Then compare:

```
At-Risk, messaged   → 34% returned within 14 days
At-Risk, held out   → 21% returned within 14 days
                      ─────
Incremental lift    → 13 points, and that is Custva
```

That is a *causal* number. It survives the "they'd have come back anyway"
objection because the held-out group is exactly the people who would have come
back anyway, measured directly.

**Why it fits what you already want:**

- It is the honest version of "actual proof of customer converting". Commission
  billed on measured lift is defensible in a way last-touch never is.
- It sends *fewer* messages, not more.
- It is cheap. **`campaign_audiences` already snapshots exactly who was selected
  for each campaign**, with a `(campaign_id, customer_id)` unique key — so this
  is one `arm` column (`treatment` | `holdout`) on a table that exists, plus a
  comparison query. No ML, no new table.
- It gives the pitch a number nobody else in this market has.

**Put the column in before the campaigns run.** It costs nothing while volume is
near zero, and every day it is absent is a day of campaign data that can never
prove incrementality. This is the one item in this document that is genuinely
irreversible if deferred.

**The cost, stated plainly:** you deliberately do not message ~10% of at-risk
customers, so some of them will not come back. That is a real revenue give-up in
exchange for a defensible number. It should be the merchant's decision, framed
honestly — and it needs enough customers per merchant to be statistically
meaningful, which a single small cafe may not have. It may need to run at
platform level across merchants before it works per-merchant.

**Second, smaller idea — send-time from their own rhythm.** Visit timestamps are
already stored. If someone comes Friday mornings, the day-14 win-back should not
fire on a Monday afternoon; it should land Thursday evening. Same message, no
extra cost, meaningfully better timing. Cheap to add once A2 computes gaps.

---

## 6. Open questions

| Question | Status |
|---|---|
| **Whose WhatsApp number sends?** | **Open, and it blocks SRS schema work.** The worker builds one adapter from `WA_PHONE_NUMBER_ID` / `WA_ACCESS_TOKEN` at startup; there are no per-merchant credentials in the schema. So every merchant sends from one Custva number. That means the cafe's customer hears from a business they don't recognise, quality rating is one shared pool where one merchant's complaints throttle everyone, Custva pays for every message, and attribution becomes bookkeeping rather than fact. Moving to per-merchant accounts (Meta Tech Provider + Embedded Signup) touches tenancy, credentials, onboarding and billing at once — cheap to decide now, expensive after the commission ledger exists |
| **Image sourcing** — where do the per-message images actually come from? | **Open.** Assumption is merchants supply photos of their own product during onboarding. Nothing is built for upload, storage or Meta approval of image templates. This blocks the "picture on every message" promise now on the landing page. Folds into Phase C2/M4 |
| Has anything ever been sent through real Meta credentials? | Almost certainly not — defect 6 means sends would fail. If anyone believes otherwise, something is configured outside the repo and needs to be seen |
| Is the pilot clock running? | If there is a signed MOU with dates, it needs reconciling against a 6–10 week SRS build on top of Phase 0 |
| Commission rate | Not set. Stored as a rate; commercial decision |
| Holdout: per-merchant or platform-level? | Open — depends on per-merchant volume |
| Do small merchants have enough customers for lift to be measurable? | Open, and worth answering before promising the number |
| **Two visits, on time — Loyal or not?** | FR-S3 leaves this unclassified. Implemented as `loyal` (conservative: no discount, no commission). Needs a product ruling |
| Stock images on the live site | Licensing unchecked. See `REDESIGN.md` §8 |

---

## 7. Decisions locked

- Segmentation and attribution are **deterministic rules**, not ML (SRS TR-1).
  ML may replace gap prediction later behind the same interface.
- Loyal customers are shielded from commission *and* from default discounts.
- Attribution baseline: 7-day window, last-touch, prefer `read` over
  `delivered`.
- Expected-gap fallback: 14 days.
- The day 0/3/7/14 grid is retained for First-Time nurture only once C3 lands.
- **Do not rewrite the repo.** Independently reached by the 8 Sep review and
  confirmed here: `customer_visits` is properly append-only, written in a
  transaction with the rollup, and `is_repeat_visit` is computed at write time.
  The visit history the predictive work depends on is intact. Every defect found
  is local — a `WHERE` clause, a missing migration, a missing import — not
  architectural. A rewrite would cost months and reproduce the same schema.

---

## 8. Scope estimate

Phase 0 is days. The SRS on top of it is **6–10 weeks** of focused work: three
migrations, one nightly job, changes to the audience engine and the visit-write
path, two new API surfaces, the Meta template integration, and dashboard work.

Worth saying out loud early — "lots of changes" invites a two-week expectation,
and this is not that.
