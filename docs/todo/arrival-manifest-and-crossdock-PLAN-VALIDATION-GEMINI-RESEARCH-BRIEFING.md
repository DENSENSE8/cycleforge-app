# Plan validation briefing — an expected-arrivals manifest at the door, and a cross-dock fast lane

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Subject:** The last two proposals from a WMS-standards review of a **used-goods reseller's** receiving door, written up as plans and submitted for validation against **industry-standard warehouse management systems**. (M) Give the door an **expected-arrivals manifest**, so a scan is a match against a known list rather than a cold lookup. (X) Build a **cross-dock fast lane**, so inbound that is already spoken for skips storage and goes straight toward outbound. Validate, amend, or reject each.
**Status:** OPEN — awaiting answer. Neither plan is built.

**The unifying question, and the reason these two are in one brief:** **the door already knows more than it shows.** The system already computes a delivered-but-unscanned hunt queue, a carrier-derived *arriving today* state, and a pending-order demand match that fires at the moment of the door scan. All three are either displayed somewhere else or used only as a sort key. So neither plan is really "build a capability" — both are **"should the door surface, and act on, information it already has?"** Judge them that way.

**Sibling briefs — read the answers, do not re-answer them:**

| Brief | Status | What it settled that constrains you |
|---|---|---|
| [`arrival-kpi-and-door-lpn-PLAN-VALIDATION-GEMINI-RESEARCH-BRIEFING.md`](./arrival-kpi-and-door-lpn-PLAN-VALIDATION-GEMINI-RESEARCH-BRIEFING.md) | **ANSWERED** | Operator screens get **actionable queues** (backlog count, oldest item), never rates or cycle times — those are manager-facing. Any new surface must pass a **data-validation gate** before shipping. Both bear directly on M |
| [`arrival-door-decisions-staging-and-osd-GEMINI-RESEARCH-BRIEFING.md`](./arrival-door-decisions-staging-and-osd-GEMINI-RESEARCH-BRIEFING.md) | OPEN | Which *decisions* the door owns (staging placement, OS&D capture) |

**Hard framing rule:** Judge only against **industry standards** — named WMS products, cross-docking and ASN literature, reverse-logistics operations research, citable UX work. **Do not** reconcile against this product's internal design constitution or house naming. Treat §2 as **empirical current state verified in source on 2026-08-09**. **A "reject" verdict is a successful outcome** — as with the sibling brief, the live risk is importing pallet-DC assumptions into a parcel-based returns operation where they do not hold.

---

## 0. Method — read before answering

### 0.1 Your job (five deliverables — keep separate)

1. **Verdict per plan.** `ADOPT` · `ADOPT WITH AMENDMENTS` · `REJECT`, independently for M and X, each with the deciding evidence. Lead with this.
2. **Standards audit.** For each practice proposed, state what the standard actually is, the population it assumes, and whether this operation is inside it (§4).
3. **Candidate scoring** — §0.3, two families, on the axes given.
4. **Replacement set.** Where a proposal fails, what would a mature system do **instead** for this shape.
5. **Adoption sequencing.** What is surfaceable on day one from data that already exists, what needs a data change, and what needs a process change.

### 0.2 What this brief is NOT

- Not ASN/EDI-856 integration design. There is no ASN here (§4) — the question is what to do *without* one.
- Not dock-door or appointment scheduling. There are no dock doors.
- Not a warehouse-layout or material-handling exercise.
- Not the metric question (settled — sibling brief) or the staging/OS&D questions (companion brief).
- Not an inventory-allocation or order-promising redesign.

### 0.3 Candidates (score both families)

**Family M — what does the door know before the box is in hand?**

| ID | Candidate | One-line |
|---|---|---|
| **M1** | **Status quo — purely reactive** | The door does nothing until a barcode is scanned; expectation lives on a separate desk surface |
| **M2** | **Surface the hunt queue at the door** | Show the existing *delivered, not yet scanned* backlog on the Arrival screen |
| **M3** | **Forward manifest** | Show *arriving today* (carrier out-for-delivery) as a list of what to expect |
| **M4** | **Scan-first, reconcile after** | Scanning stays the only input; the list is an end-of-day reconciliation report, not a working surface |
| **M5** | **Manifest-driven receiving** | The operator works *from* the list and checks arrivals off it — classic ASN-style receiving |

**Family X — does demand-matched inbound get a shortcut?**

| ID | Candidate | One-line |
|---|---|---|
| **X1** | **Status quo — priority only** | A pending-order match sets top priority and a stock-out lane; the physical path is unchanged |
| **X2** | **Signal it, don't route it** | Same as X1, but the match is made *visible* at the door (identity chip / label / lane) so a human can act on it |
| **X3** | **Staging bypass** | Demand-matched cartons skip shelf assignment and go to a dedicated cross-dock lane |
| **X4** | **Stage bypass** | Demand-matched units skip or compress downstream stages (e.g. straight to Testing, or straight to Pack) |
| **X5** | **Opportunistic cross-dock** | The system routes the carton toward outbound at the door, storage never involved |

Score 1–5 on each axis; one table per family. No sixth axis.

| Axis | Meaning |
|---|---|
| **Standards fit** | Does a mature WMS do this, for this population |
| **Decidability at the door** | Can the call be made with what is knowable before the box is opened |
| **Operator cost** | Touches, decisions, and dwell added at the busiest point of the day |
| **Failure visibility** | When it is wrong, does anyone notice — or does a box quietly skip a step it needed |
| **Small-team fit** | Survives a 1–15 person operation with no receiving clerk and no dispatcher |

**ROI ≈ (Standards fit × Decidability × Failure visibility × Small-team fit) / (6 − Operator cost).**

### 0.4 Sources to cover (minimum)

| Class | Named examples | Use for |
|---|---|---|
| **Cross-docking practice** | Planned vs opportunistic cross-dock; flow-through distribution; Manhattan / Blue Yonder / Körber cross-dock modules; retail cross-dock case studies | X — what cross-docking requires to be legal |
| **Quality gates vs speed** | Inbound inspection, quarantine, and "no bypass of QC" practice in regulated and unregulated flows | X — the central question: may a demand match skip inspection |
| **ASN / expectation-driven receiving** | ASN-based receipt; blind vs informed receiving; what receiving looks like when no ASN exists | M — the manifest question |
| **Parcel-carrier event data** | Carrier tracking event categories (out-for-delivery, delivered), event reliability and latency, multi-piece behaviour | M — can carrier events *be* a manifest |
| **Reverse-logistics intake** | ReturnPro / Optoro / goTRG; returns-processing intake flow; RMA-driven vs unannounced returns | M, X — the population that actually matches this operation |
| **Small-operation WMS** | NetSuite WMS, Logiwa, Extensiv, ShipHero, Fishbowl inbound modules | Both — what a small team is actually given |
| **Human factors** | Confirmation bias and checklist-driven verification; research on working from an expected list vs recording what is present; alarm/queue fatigue | M — the risk in M5 |

---

## 1. The two plans under review

### Plan M — an expected-arrivals manifest at the door

**The argument as written:** an expected-today list would turn the door scan into a **match against a known manifest** rather than a cold lookup. Carrier tracking already tells the system which shipments are out for delivery and which have been delivered, so the expectation exists — the door simply does not show it.

**Proposed change:** surface expected/delivered-not-yet-scanned arrivals on the Arrival screen.

### Plan X — a cross-dock fast lane

**The argument as written:** standard cross-docking confirms a receipt and immediately reassigns the goods outbound rather than storing them. The reseller analogue is inbound that is **already spoken for** — matching an open order, a warranty replacement, or a repair coming back. Such a unit should skip shelf staging and route straight toward Testing or Pack. The `LINK REPAIR ORDER` control already on the door screen is the seed of it.

**Proposed change:** a fast lane that bypasses normal staging (and possibly stages) for demand-matched inbound.

---

## 2. Measured current state (verified in source 2026-08-09)

You do not have the repo. Treat this as ground truth; do not invent behavior.

### 2a. The expectation data already exists, and is richer than the plan assumes

A carrier-derived **delivery state** is computed per inbound shipment, with this vocabulary (ordered by operational urgency):

`RECEIVED · DELIVERED_UNOPENED · DELIVERED_NOT_UNBOXED · ARRIVING_TODAY · STALLED · TRACKING_UNAVAILABLE · IN_TRANSIT · AWAITING_TRACKING · CARRIER_MISMATCH · PENDING_CARRIER · UNKNOWN · WRONG_DESTINATION`

`ARRIVING_TODAY` is defined as the carrier's own `OUT_FOR_DELIVERY` status category. So **a forward-looking "arriving today" signal already exists** and is derived from carrier events, not from a supplier ASN.

### 2b. A "dock hunt queue" is already built — on a different screen

There is a dedicated source-of-truth module for **delivered but not scanned**, described in its own header as the *dock hunt queue*:

- **Unit is the shipment**, not the PO line: a delivered inbound shipment, inside the window, with no operator scan against any linked receiving row.
- **14-day window**, list capped at 100. A 45-day sibling exists for the next stage (delivered but not unboxed).
- **Age bands** are already computed: `lt_24h · h24_48 · gt_48h`.
- **A stated physical-first exit rule:** *"a dock scan (or window age-out) is the only way off this queue. ERP terminal status must NEVER hide an unscanned delivered box — ERP state is enrichment/badge only."*
- It has its own endpoint and is surfaced as a **facet on the Inbound desk** (a separate pointer-driven screen), with the tile count, the list, and the row badges all derived from the one predicate so they cannot disagree.

**None of it appears on the Arrival door screen.** The door is purely reactive to a scan today.

### 2c. Demand matching already exists — and already fires at the door

At door-scan time, the lookup path computes **pending-order SKU matches** for the carton's lines. On a hit it:

- sets the carton to top urgency (`is_priority = true`, manual priority tier 0), idempotently; and
- stamps the triage **priority lane** — but only when the operator has not already set one.

The lane vocabulary already contains a fast-lane-shaped value: **`PO_STOCKOUT` ("Purchase order — Stock-out")**, alongside `PO_STANDARD`, `RETURN`, and `HOLD`.

This fires from five call sites in the scan path. **So the demand signal is already detected at the exact moment Plan X wants to act on it.**

### 2d. Three constraints on that demand match

- **It is SKU-level and requires lines.** The match runs over the carton's receipt lines. A carton with no PO has no lines, so **the match cannot fire for unidentified inbound** — the population with the most operational pain.
- **It changes ordering, not routing.** Priority and lane are sort keys and filters. Nothing bypasses a stage; the carton still walks shelf → unbox → test → pack.
- **Manual always wins.** An operator's chosen lane is never overwritten.

### 2e. Repair and return linkage at the door

The door screen carries a `LINK REPAIR ORDER` control, which creates a line typed `REPAIR` and upserts a repair-service record. Separately, scanning a returned unit's serial at the **bench** closes the shipped↔returned loop. So repair-inbound is identifiable at the door; return-to-order matching happens later, at serial scan.

---

## 3. Research questions (answer all)

### M-side

**Q1 — Can carrier events function as a manifest at all?**
An ASN is a supplier's declaration of *what is in the box*. A carrier out-for-delivery event says only *a box is coming*. Is a carrier-derived arrival list a legitimate substitute for an expectation list, or a different object that should not be presented as one? What do operations without ASNs actually put in front of a receiver?

**Q2 — Working from a list vs recording what is present.**
M5 has the operator check arrivals off an expected list. What does the evidence say about confirmation bias in checklist-driven verification — does an expected list make a receiver more likely to record what they expected rather than what arrived? Relate this to blind-receiving practice, and say whether M5 is a known anti-pattern for unannounced/returns inbound.

**Q3 — Door or desk?**
The hunt queue already exists on a pointer-driven desk screen. Is a delivered-but-unscanned backlog an **operator-at-the-door** surface or a **supervisor** surface? The sibling brief's answer endorsed *actionable queues* on operator screens (backlog count, oldest item) while rejecting rates — does the hunt queue qualify as actionable at the door, or is it actionable only for whoever goes hunting?

**Q4 — What does a receiver actually gain?**
Concretely: at the moment a box is physically in the operator's hands, what does knowing "14 other boxes were delivered and not scanned" change about the next 10 seconds? If the answer is "nothing," M belongs elsewhere regardless of its data quality.

**Q5 — Duplication risk.**
If the hunt queue appears in two places with two purposes, what is the standard for keeping them coherent, and is two placements of one queue a known maintenance hazard?

### X-side

**Q6 — Is cross-docking legal when the goods must be inspected?**
This is the crux. Cross-docking assumes inbound is **sellable as received**. Used and returned goods are by definition not — they require grading before resale. Under what conditions, if any, does industry permit demand-matched inbound to bypass inspection? Is there a recognised category (sealed new-in-box, known-good replacement, a repaired unit returning from a vendor) where a bypass is standard, and how is that category established *before the box is opened*?

**Q7 — Planned vs opportunistic cross-dock.**
Industry distinguishes planned cross-dock (decided before arrival) from opportunistic (decided at receipt on a live demand signal). §2c is an opportunistic signal. Which is standard for small operations, and does opportunistic cross-dock require infrastructure (a staging lane, a dispatch cadence, an outbound cutoff) that a 1–15 person operation does not have?

**Q8 — Is priority already the correct answer?**
X1 is the status quo: the match sets urgency and a lane. Is a **sequencing** change (do this one first) the industry-standard response to an opportunistic demand match at small scale, with **routing** changes reserved for higher volumes? If so, X2 — making the existing signal visible rather than acting on it — may be the whole job.

**Q9 — The population problem.**
§2d: the demand match requires lines, so it fires only for PO-paired cartons and never for unidentified inbound. Does that make the fast lane serve the cartons that least need help? Is there a standard way to demand-match *before* contents are known (serial-level RMA lookup, tracking-number-to-order linkage), and is it worth it?

**Q10 — Failure mode of a bypass.**
If a demand-matched unit skips a stage and turns out to be defective, what has the operation lost, and what do mature systems do to make that failure visible rather than silent? Weigh against the sibling brief's finding that in a reverse flow, **exceptions are the work**.

---

## 4. Constraints that are product facts (not house taste)

A recommendation violating one is out of scope, not bold.

- **No ASN, ever.** No supplier declares contents in advance. The only pre-arrival signal is carrier tracking.
- **Parcels, not pallets.** Continuous trickle arrival, no dock doors, no appointments, no scheduled receiving window.
- **Goods must be graded before resale.** Inbound is used, returned, or traded-in. Condition is established by inspection at the bench, not at the door.
- **A large share of inbound is unidentified at arrival** — no PO, no lines, sometimes no known sender.
- **The demand match is SKU-level and needs lines** (§2d). Changing that is a real project, not a flag.
- **1–15 person tenants**, no receiving clerk, no dispatcher, no outbound cutoff discipline. One person may be door, bench, and pack in the same shift.
- **Wedge scanners; desk monitors ~1440px.** Not RF handhelds.
- **The hunt queue's exit rule is physical-first** and must stay so: only a dock scan or age-out clears a delivered-unscanned box; ERP status may never hide one.
- **Operator screens carry actionable queues, not rates** (settled by the sibling brief).

---

## 5. Deliverable format (mandatory)

```
# Door manifest + cross-dock fast lane — plan validation

## Verdicts
Plan M: ADOPT / AMEND / REJECT — one paragraph, deciding evidence
Plan X: ADOPT / AMEND / REJECT — one paragraph, deciding evidence

## Score tables
| M candidate | Standards fit | Decidability | Operator cost | Failure visibility | Small-team fit | ROI |
| X candidate | … same axes … |

## Standards audit
| Proposed thing | What the standard actually is | Population it assumes | Applies here? | Source |

## Answers to Q1–Q10

## Replacement set
What to surface / route instead, where a proposal was rejected

## Adoption sequencing
Surfaceable today from existing data · needs a data change · needs a process change

## Ask-first
Only where a call needs a product decision not derivable from industry + §2–§4
```

---

## 6. Closed for *this research* (do not recommend)

Out of scope for this deliverable, not eternal bans:

- Building ASN/EDI ingestion or asking suppliers to declare contents.
- Dock scheduling, appointment booking, or carrier integration beyond the tracking events that already exist.
- Redesigning the outbound side (pack, ship, or order promising).
- Automated material handling, conveyors, or sortation.
- Changing the grading/inspection process itself — only whether it may be **bypassed**.
- Per-operator productivity measurement (settled and excluded by the sibling brief).

You **may** conclude that either plan is a pallet-DC or ASN-era standard that does not survive contact with unannounced parcel returns, and should not be built. Say it plainly with the evidence rather than softening it into a phased adoption.

---

**End of briefing.** Prefer primary sources dated 2024–2026, and named products and standards over anonymous "best practice." Where forward-DC and reverse-logistics practice disagree, show both and decide for §4's shape — a small reseller receiving unannounced, unidentified parcels one at a time, where every unit must be inspected before it can be sold.
