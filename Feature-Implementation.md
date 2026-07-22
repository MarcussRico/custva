---
name: Segmentation Attribution Engine
overview: SRS-style business and technical requirements for CUSTVA customer segmentation (First-Time, Loyal, At-Risk, Dormant), expected revisit prediction, organic vs CUSTVA-influenced attribution, and commission only on incremental influenced revenue.
todos: []
isProject: false
---

# Software Requirements Specification (SRS)

## CUSTVA — Customer Segmentation & Incremental Attribution

| Field | Value |
|-------|--------|
| **Document type** | Business + Technical SRS |
| **Product** | CUSTVA |
| **Feature set** | AI-ready customer segmentation, revisit prediction, return attribution, incremental commission |
| **Status** | Requirements baseline |
| **Audience** | Product, engineering, business stakeholders |

---

## 1. Purpose

This document defines **what** CUSTVA must do to:

1. Differentiate customers who would return anyway from customers who need intervention.
2. Prove which returns were influenced by CUSTVA campaigns.
3. Charge commission only on **incremental** value—not on organic loyal returns.

It does **not** prescribe sprint tasks, file-level implementation steps, or build phases.

---

## 2. Problem statements

### 2.1 Problem 1 — Repeat vs retained

**Merchant concern:** “I already have loyal customers. If CUSTVA sends them discounts, I lose margin because they would have returned anyway. How do you know CUSTVA caused the return?”

**Requirement intent:** Classify customers and act differently by segment so loyal customers are not discount-spammed, and interventions target only customers who need them.

### 2.2 Problem 2 — Commission on inevitable returns

**Merchant concern:** “If my regular comes back, that’s my customer. Why pay commission on revenue I would have earned anyway?”

**Requirement intent:** Measure and bill only **CUSTVA-influenced** returns within a defined attribution model; never commission organic loyal returns.

---

## 3. Goals and non-goals

### 3.1 Goals

- Segment every merchant customer into exactly one of: First-Time, Loyal, At-Risk, Dormant.
- Predict each customer’s **expected revisit date** from visit history.
- Trigger campaigns / offers primarily for At-Risk and Dormant (and nurture for First-Time).
- Protect Loyal customers from unnecessary discounts.
- Attribute each return visit as **Organic** or **CUSTVA-influenced**.
- Expose organic vs influenced revenue separately on the merchant dashboard.
- Apply commission only to influenced revenue.

### 3.2 Non-goals (this SRS)

- Replacing Meta WhatsApp as the messaging channel.
- Full payment-gateway / automated invoicing (ledger and reporting are in scope; PSP integration may be later).
- Black-box ML as a hard dependency for v1 (rules + statistical prediction are acceptable if explainable).

---

## 4. Stakeholders and users

| Stakeholder | Interest |
|-------------|----------|
| Café merchant | Protect margins; see fair “CUSTVA value”; avoid paying for organic regulars |
| Merchant staff | Log visits; understand customer segment at POS/CRM |
| Platform admin | Configure policies; audit influenced revenue and commission |
| CUSTVA commercial | Defensible commission narrative; trustable metrics |

---

## 5. Business requirements

### BR-1 — Fair value claim

CUSTVA shall claim credit only for returns it can reasonably attribute to platform action, not for all repeat visits.

### BR-2 — Margin protection

CUSTVA shall not default to sending discount offers to Loyal customers.

### BR-3 — Segment-specific treatment

| Segment | Business action |
|---------|-----------------|
| First-Time | Nurture toward second visit |
| Loyal | Appreciation / loyalty recognition; no unnecessary discounts |
| At-Risk | Personalized reminder or light offer |
| Dormant | Win-back campaign |

### BR-4 — Incremental commission only

Commission shall apply only when a visit is classified as **CUSTVA-influenced**. Organic returns (including Loyal returns) shall not generate commission.

### BR-5 — Transparency

Merchants shall see:

- Counts (or revenue) for organic repeat customers / revenue
- Counts (or revenue) for CUSTVA-influenced customers / revenue
- Incremental revenue attributable to CUSTVA
- Enough detail to understand *why* a visit was marked influenced (message + window)

### BR-6 — Explainability

Segment and attribution outcomes shall be explainable in plain language (e.g. “late vs expected revisit”, “returned within 7 days of delivered campaign”).

---

## 6. Definitions

| Term | Definition |
|------|------------|
| **Visit** | A recorded customer transaction at the café (timestamp + optional billing amount) |
| **Expected gap** | Typical days between this customer’s consecutive visits (or merchant fallback) |
| **Expected revisit date** | `last_visit + expected_gap` |
| **Organic return** | Return that CUSTVA does not claim for commission |
| **CUSTVA-influenced return** | Return meeting attribution rules after a measurable CUSTVA message |
| **Attribution window** | Time after message delivery/open during which a return may be attributed |
| **Incremental revenue** | Sum of billing amounts on CUSTVA-influenced visits |

---

## 7. Functional requirements — Segmentation

### FR-S1 — Four segments

The system shall classify each customer into one primary segment:

1. **First-Time** — exactly one visit.
2. **Loyal** — frequent returner who is on-time or early relative to expected revisit.
3. **At-Risk** — historically returning customer who has missed the expected revisit window (moderately late).
4. **Dormant** — historically returning customer who is severely late or long inactive.

### FR-S2 — Expected revisit

The system shall compute and store (or expose):

- `expected_gap_days`
- `expected_revisit_at`

**v1 calculation rule (baseline):**

- If customer has ≥ 3 visits: `expected_gap_days = median` of inter-visit intervals.
- Else: merchant-level median gap, or default **14 days** if insufficient data.
- `expected_revisit_at = last_visit + expected_gap_days`.

### FR-S3 — Segment thresholds (baseline)

Using `days_late = days_since_last_visit / expected_gap_days`:

| Segment | Baseline rule |
|---------|----------------|
| First-Time | `total_visits = 1` |
| Loyal | `total_visits ≥ 3` AND `days_since_last_visit ≤ 1.25 × expected_gap` |
| At-Risk | `total_visits ≥ 2` AND `1.25 × expected_gap < days_since_last_visit ≤ 2.5 × expected_gap` |
| Dormant | `total_visits ≥ 2` AND (`days_since_last_visit > 2.5 × expected_gap` OR inactive ≥ 60 days when history is thin) |

Threshold multipliers may be configurable later; values above are the SRS baseline.

### FR-S4 — Recomputation

Segment and expected revisit shall be refreshed when a new visit is recorded, and periodically for customers with no new visits (so At-Risk / Dormant can emerge over time).

### FR-S5 — Overlay attributes

Existing commercial overlays (e.g. High-value by spend) may coexist but shall not replace the four primary segments.

---

## 8. Functional requirements — Intervention policy

### FR-I1 — Need-based campaigns

Campaign targeting shall support selecting audiences by segment (especially At-Risk and Dormant).

### FR-I2 — Loyal discount protection

By default, discount / deep-offer campaigns shall **not** target Loyal customers. Merchant override, if allowed, must be explicit.

### FR-I3 — Loyal messaging

Loyal customers may receive appreciation or non-discount loyalty messages.

### FR-I4 — First-Time nurture

First-Time customers may receive nurture sequences (consistent with existing lifecycle messaging concepts).

### FR-I5 — Win-back

Dormant (and late At-Risk) customers are primary recipients of win-back offers.

---

## 9. Functional requirements — Attribution

### FR-A1 — Visit classification

Every visit shall be tagged with a return type:

- `organic`
- `custva_influenced`

### FR-A2 — Attribution inputs

Attribution may use:

- Messages sent by CUSTVA (campaign or automated lifecycle)
- Delivery / read status from WhatsApp webhooks
- Optional later: CTA click or redemption events

### FR-A3 — Attribution window

Baseline window: **7 days** from message `delivered_at` or `opened_at` (prefer open if present).

A return at time `T` may be attributed to message `M` if `M` was delivered/read and the event time falls within `[T − window, T]`.

### FR-A4 — Last-touch baseline

If multiple eligible messages exist, use the most recent eligible message (prefer `read` over `delivered`).

### FR-A5 — Loyal commission shield

If the customer is **Loyal** at the time of the return (or per policy at time of message), the visit shall be classified **organic** for commission purposes—even if a CUSTVA message was sent—unless a stronger proof signal (e.g. explicit redemption) is defined in a later revision.

### FR-A6 — Influenced eligibility

A visit may be `custva_influenced` when:

- An eligible message exists within the window, **and**
- The customer’s relevant segment is At-Risk, Dormant, or First-Time (nurture), per FR-A5 shield for Loyal.

### FR-A7 — Traceability

For each influenced visit, the system shall retain linkage to the attributed message (and campaign or lifecycle schedule when applicable).

---

## 10. Functional requirements — Metrics and commission

### FR-M1 — Split repeat economics

The system shall distinguish at least:

| Metric | Meaning |
|--------|---------|
| Organic repeat revenue | Revenue from organic repeat visits |
| CUSTVA-influenced revenue | Revenue from influenced visits |
| Incremental revenue | Same as influenced revenue for billing narrative |

Legacy “all repeat visit revenue” may remain as a secondary metric but shall not be labeled as CUSTVA-generated revenue.

### FR-M2 — Dashboard presentation

Merchant dashboard shall display organic vs CUSTVA-influenced figures separately (counts and/or revenue).

### FR-M3 — Commission basis

Commission amount is derived only from influenced visit billing amounts × agreed rate.

### FR-M4 — Commission ledger

The system shall record commission events (merchant, visit, influenced amount, rate, commission amount, status) for audit and invoicing—even if payment collection is offline initially.

### FR-M5 — No commission on organic

Organic visits shall not create payable commission events.

---

## 11. Data requirements

### DR-1 — Visit store

Every visit must persist timestamp and billing amount (already required by product).

### DR-2 — Customer segment state

Per customer, system of record must support:

- primary `segment`
- `expected_gap_days`
- `expected_revisit_at`
- `segment_updated_at`

### DR-3 — Visit attribution fields

Per visit, system of record must support:

- `return_type` (`organic` | `custva_influenced`)
- optional FKs to message / campaign / lifecycle schedule
- attribution window used (for audit)

### DR-4 — Message identity

Messages must remain uniquely identifiable and status-tracked (sent / delivered / read / failed) to support attribution.

### DR-5 — Aggregates

Daily (or equivalent) merchant metrics must support organic vs influenced visit/revenue rollups.

### DR-6 — Optional engagement events (future)

CTA click / redemption events may be stored to strengthen attribution; not mandatory for baseline SRS acceptance.

---

## 12. Technical requirements (system behavior)

### TR-1 — Deterministic rules for v1

Baseline segmentation and attribution shall be deterministic and auditable (rules + statistics). Future ML models may replace gap prediction behind the same interfaces without changing commission business rules.

### TR-2 — Consistency with multi-tenancy

All segment, attribution, and commission data are scoped by `merchant_id`.

### TR-3 — Compatibility with existing messaging

Attribution shall work for both:

- Merchant-triggered campaigns
- Automated lifecycle messages

### TR-4 — API exposure

Customer and analytics APIs shall expose segment, expected revisit, and organic/influenced metrics needed by merchant UI.

### TR-5 — Policy enforcement point

Audience selection / campaign send path shall enforce Loyal discount protection (FR-I2).

### TR-6 — Privacy and opt-in

WhatsApp interventions remain subject to customer opt-in; attribution still classifies visits even if no message was sendable.

---

## 13. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Segment explanation must be understandable to a non-technical café owner |
| NFR-2 | Attribution decision for a visit must be reconstructible from stored fields |
| NFR-3 | Segmentation refresh must not block basic visit capture beyond acceptable POS latency |
| NFR-4 | Metrics used for commission must be immutable after visit close (corrections via explicit adjustment process if needed later) |
| NFR-5 | Configuration of window/thresholds/rates should be possible without rewriting core logic (future-configurability) |

---

## 14. Business rules summary

```text
IF visit is first-ever for customer
  → segment becomes First-Time after write; return_type typically N/A or organic for first visit

IF customer Loyal AND return occurs
  → return_type = organic (commission shield)
  → messaging policy = appreciation, not discount

IF customer At-Risk OR Dormant
  AND eligible CUSTVA message delivered/read within attribution window before return
  → return_type = custva_influenced
  → commission_event allowed

IF no eligible message in window
  → return_type = organic
```

---

## 15. Acceptance criteria (product)

1. Merchant can see each customer’s segment and expected revisit date.
2. Loyal customers are excluded from default discount campaigns.
3. Dashboard shows **Organic repeat revenue** and **CUSTVA-influenced revenue** as separate numbers.
4. A sample influenced visit shows linked message identity and window.
5. Commission report includes only influenced visits.
6. A Loyal regular who returns without needing a win-back does **not** appear as influenced revenue.

---

## 16. Relationship to current product (gap statement)

| Capability | Current CUSTVA (as-is) | This SRS (to-be) |
|------------|------------------------|------------------|
| Visit timestamps & amounts | Exists | Required input |
| Repeat = any 2nd+ visit revenue | Exists as retention revenue | Split into organic vs influenced |
| Tags New / Repeat / Inactive | Exists (coarse) | Replaced/extended by four segments |
| Lifecycle Day 0/3/7/14 | Exists | Remains nurture channel; not attribution proof alone |
| Message delivery/read | Exists | Input to attribution |
| Visit↔message link | Missing | Required |
| Expected revisit | Missing | Required |
| Commission on incremental only | Missing | Required |

---

## 17. Open parameters (defaults locked for baseline)

| Parameter | Baseline value |
|-----------|----------------|
| Attribution window | 7 days |
| Loyal on-time bound | ≤ 1.25 × expected gap |
| At-Risk bound | (1.25, 2.5] × expected gap |
| Dormant bound | > 2.5 × expected gap (or ≥ 60 days thin history) |
| Expected gap fallback | 14 days |
| Commission rate | Commercial decision (stored as rate; not fixed in this SRS) |
| ML model | Optional future; not required for SRS compliance |

---

## 18. Document control

This SRS is the authoritative requirements description for **segmentation, attribution, and incremental commission**. Implementation design, sequencing, and engineering tickets are out of scope for this document.
