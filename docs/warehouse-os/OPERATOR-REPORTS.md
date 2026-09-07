# Operator reports — the five sentences

**Status:** landed 2026-09-07 · **Surface:** `/` and `/session` (chat left, artifact panel right)

You type a sentence. The panel on the right paints a report you can read once,
standing up, and act on. This is the list of sentences, what each one is defined
to mean, and where every number comes from.

Type them verbatim the first time. The router also accepts the paraphrases
listed under each — those are the aliases in
`src/lib/assistant/tool-subsetting.ts`, and they are what the local model on the
Mac sees, so a phrase that is not there is a report the local box cannot reach.

---

## The engine: one artifact, five questions

There is **one** artifact kind — `report` (`artifactReportSchema` in
`src/lib/assistant/ui-artifacts.ts`) — and **one** renderer
(`src/components/session/artifacts/ReportArtifact.tsx`). A question contributes
data, never a component. Five bespoke report kinds would be five renderers and
five vocabularies to drift; that is the fork `table-engine-law.ts` forbids for
desks, and it is forbidden here for the same reason.

Every report carries the same six parts:

| Part | What it is for |
|---|---|
| `headline` | The one number the sentence asked for. Largest thing on the panel. |
| `kpis` | Up to 8 named numbers, each with a **verdict** (`good`/`watch`/`bad`/`neutral`) and a **`definition`** — the arithmetic, in a sentence. |
| `sections` | Up to 4 tables. Right-aligned numbers, tabular figures, a totals row that reconciles. |
| `standards` | The operating standards the math used, printed on the face of the report. |
| `notes` | Definitions, caveats, and the blind spots — what this report does **not** count. |
| `followUps` | Sentences that seed the composer. Data, not behavior. |

**Why the definitions ride along.** A number you cannot audit is a number you
have to phone someone about. "42 boxes" means nothing until the report says
which boxes it counted and from when. So the standards and the definitions are
on the report, not in a wiki — you can disagree with the *standard* instead of
distrusting the *result*.

**The numbers are not retyped by the model.** Report tools return
`{ artifact, summary }`; the loop (`src/lib/assistant/tool-artifact.ts`) sends
the artifact to the panel and gives the model only the summary. The model cannot
drop a digit out of a total it never handled. It gets one or two sentences to
say the headline and name the next action.

---

## 1. Packing performance

> **"What is Maria's packing performance today?"**

Paraphrases: `packing performance` · `how many boxes did Maria pack` ·
`packer efficiency` · `wait minutes` · `minutes per box` · `packed today` ·
`pack floor`

Omit the name and you get the whole pack floor. Name someone who matches two
people and the report lists the matches and asks which one — it never guesses a
person.

**Tool** `get_packing_performance` · **permission** `operations.view` ·
**builder** `src/lib/reports/packing-performance.ts`

### The standard (owner-declared 2026-09-07)

| Item | Standard | What it is |
|---|---|---|
| Small | **5 min/box** | Pack-and-label parts: boards, cables, remotes, adapters. |
| Medium | **15 min/box** | Semi-complete units: clean, accessories, PSU, remote, careful pack. |
| Big | **60 min/box** | Full heavy systems: Lifestyle / home theater stacks, double-box. |

Single source of truth: `DEFAULT_TIER_MINUTES` in
`src/lib/packing/pack-tier-classifier.ts`. Change it there and the packer KPI
rollup, the per-scan report, the FBA fillable-units estimate and every
`standards[]` block move together. Pinned by
`src/lib/packing/packer-kpi-queries.test.ts`.

### The four clocks

Every completed pack scan is paired with the packer's most recent preceding
`PACK_SCAN` on the same PST day, so each box has a real start and a real end.

| Clock | Definition |
|---|---|
| **Standard (earned)** | The tier standard above, or the SKU pack profile's own minutes when one is linked. |
| **Handle** | `PACK_COMPLETED` minus the matched `PACK_SCAN`. Hands actually on the box. |
| **Wait** | Idle gap: this box's scan minus the previous box's completion. This is queue time — the minutes the packer was not packing. |
| **Attended** | Last completion minus first scan of that packer's day. |

A gap over the **break threshold (90 min)** is a break, not queue wait: it is
excluded from wait minutes and counted separately as a break. That threshold is
printed on the report.

### The KPIs

| KPI | Reads | Verdict |
|---|---|---|
| Boxes packed | count of `PACK_COMPLETED` | — |
| Earned minutes | 5/15/60 mix | — |
| Handle minutes | Σ scan→complete | — |
| Wait minutes | Σ idle gaps under 90 min | good ≤ 3 min/box · watch ≤ 8 |
| **Efficiency** | earned ÷ handle | good ≥ 95% · watch ≥ 75% · target 100% |
| **Utilization** | handle ÷ attended | good ≥ 80% · watch ≥ 60% |
| Minutes per box | handle ÷ boxes | — |
| Capacity left | workday minus handle | — |

Efficiency above 100% means beating standard. Utilization below 60% with good
efficiency means the packer is fast and **starved** — that is a feeding problem,
not a packer problem, and the two numbers side by side are what tell you which.

### The tables

1. **Per packer** — packer · boxes · small · medium · large · earned · handle ·
   wait · efficiency · utilization · % of day, with a totals row that sums the
   columns. *This is the "exact staff per items packed".*
2. **Item number to time** — one row per box, newest first: time · **item
   number** · sku · product · tier · standard · handle · wait · packer. When
   there is no item number it falls back to sku, then to the scan reference —
   never an empty identity cell.
3. **Tier mix vs standard** — tier · boxes · standard each · earned · actual ·
   signed variance.

### What it does not count

Only `PACK_COMPLETED` scans. A box scanned but never completed is not here, and
the note says how many completions had no matching start (no handle, no wait).
Tier source is reported per row: operator SKU profile when linked, otherwise
title rules.

---

## 2. Unbox backlog

> **"How many boxes are left to be unboxed?"**

Paraphrases: `left to be unboxed` · `unbox backlog` · `boxes to open` ·
`waiting at receiving` · `packages to open` · `not unboxed`

**Tool** `get_unbox_backlog` · **permission** `receiving.view` ·
**builder** `src/lib/reports/unbox-backlog.ts`

### The definition

A box is a `receiving_carton` row. It is "left to be unboxed" when it has
arrived in the building and has not received the unbox write:

```
receiving_unbox.unboxed_at IS NULL
AND (receiving_triage.door_received_at IS NOT NULL OR a receiving_scans row exists)
```

That is byte-for-byte the bench queue predicate
(`src/lib/receiving/lines/build-sql.ts`), so the report and the Unbox station
can never disagree about the number.

### The KPIs

Boxes waiting · units waiting (`Σ quantity_expected`) · oldest days
(good ≤ 2 · watch ≤ 5) · **on bench** (opened but not finished — good 0,
watch ≤ 3; these are half-done and are the first thing to close out) · returns ·
priority · **unfound** (cannot be received against a PO yet, good 0 · watch ≤ 5).

### The tables

Age of the backlog (`Today` / `1 day` / `2–3` / `4–7` / `8+`, with totals) ·
Where it came from (per `source`) · Oldest boxes first (≤ 100 rows with age,
arrival, box id, PO, lines, units, flags).

### What it does not count

- A carton is one physical **box**, not one item. Units come from
  `quantity_expected`.
- **No weight or dimension data exists** anywhere on inbound cartons, so no
  volume or labor-hours estimate is offered. It would be invented.
- Carrier-delivered packages never scanned at the dock are **not** in this
  count. That is a different queue — ask the follow-up, or see
  `/api/receiving-lines/incoming/delivered-unscanned`.

---

## 3. Most expensive order in the building

> **"What is the most expensive order currently in the warehouse?"**

Paraphrases: `most expensive order` · `highest value order` · `biggest order` ·
`value in the building` · `expensive order in the warehouse`

**Tool** `get_order_value_rank` · **permission** `dashboard.view` ·
**builder** `src/lib/reports/order-value-rank.ts`

### The definition

`orders` is stored at **line-item grain** — one row is one line — so an order is
a group of rows sharing `order_id`, and its value is `SUM(sale_amount)`. That is
stated on the report.

"Currently in the warehouse" is four clauses, each printed in `standards[]`:

1. not dock scanned-out (no `SHIP_CONFIRM` on the shipment),
2. not in carrier custody (`shipping_tracking_numbers` still `LABEL_CREATED` /
   `UNKNOWN`),
3. `fulfillment_channel <> 'AFN'` — Amazon ships those, not you,
4. not caged without a catalog match.

Clauses 1–2 reuse `src/lib/orders/order-grain-sql.ts`, so the report cannot
drift from the outbound desks.

Stage per order is the **least advanced** line: `AWAITING_LABEL` → `BLOCKED` →
`PENDING` → `PICKED` → `PACKED`.

### The KPIs

Top order value · top order age (good ≤ 2 days · watch ≤ 5) · top order stage ·
orders in the building · total value in the building · **at-risk value** (value
past its ship-by; any dollar past due is `bad`, and `neutral` with a note when no
deadlines exist).

### The tables

Top orders by value (rank · order · value · lines · stage · age · ship-by ·
channel · tracking) · Lines in the top order · Value by stage, with totals.

### What it does not count

- This is **sale value, not profit**. There is no cost, fee or margin column in
  the schema. The report says so.
- Ship-by is the **TEST work-assignment deadline**
  (`work_assignments.deadline_at`), not a column on `orders`.
- Currency is per order; a total only mixes currencies if more than one appears,
  and it says when it does.

---

## 4. Highest ROIs

> **"What are the highest ROIs right now?"**

Paraphrases: `highest roi` · `highest rois` · `biggest gaps` ·
`clear the backlog` · `fix first` · `where are we leaking`

**Tool** `get_roi_rank` · **permission** `operations.view` ·
**builder** `src/lib/reports/roi-rank.ts`

### The six gaps

Received but never listed · dead stock (dormant ≥ 90 days) · open order
exceptions · open receiving exceptions · units on hold · repairs in flight.
Live row counts, never estimates.

### The ranking — printed, not hidden

```
ageWeight = 1 + min(oldestDays, 60) / 30     →  0 d = 1.0x · 30 d = 2.0x · 60 d+ = 3.0x
priority  = units × ageWeight
effort    = units × minutes-to-clear-per-unit
payback   = priority ÷ effort hours
```

A 5-unit gap 40 days old outranks a 60-unit gap from this morning. You know
that; a raw count does not. `units`, `oldestDays`, `ageWeight`, `priority`,
`effort` and `payback` are **separate columns**, so you can re-rank by eye and
disagree with the formula.

Minutes to clear per unit — declared operating standards, printed on the report,
not measurements: unlisted 6 · dead stock 15 · order exception 12 · receiving
exception 20 · on hold 10 · repair 45.

### The KPIs

Top gap · its units · its oldest age (good ≤ 7 days · watch ≤ 30) · total stuck ·
total effort · **person-days** (effort ÷ workday; good ≤ 1 · watch ≤ 3) · gaps
open.

### What it does not do

**It attaches no dollar figure.** The schema has no reliable per-unit price, and
ranking by fabricated revenue would be a horoscope with a currency symbol. It
gives you count, decay and effort — the three things you can act on.

A gap is a **category**, not a work order. Each row's follow-up sentence pulls
the actual rows.

---

## 5. Who to delegate to

> **"Which staff can I delegate to attack the highest ROIs in terms of pending tasks?"**

Paraphrases: `delegate` · `who should attack` · `who is free` ·
`pending tasks` · `roster load` · `who can i send`

**Tool** `get_delegation_plan` · **permission** `work_orders.view` ·
**builder** `src/lib/reports/delegation-plan.ts`

It imports the ranking function from `roi-rank.ts` — the formula exists once, so
the two reports can never name a different top gap.

### The match

Gap → station, declared and printed:

| Gap | Station |
|---|---|
| Received but never listed | TECH |
| Dead stock | SALES |
| Open order exceptions | PACK |
| Open receiving exceptions | UNBOX |
| Units on hold | TECH |
| Repairs in flight | TECH |

Eligibility is `staff_stations`, with an `employee_id` prefix fallback
(`PACK-07` → PACK). Staffers whose station was *derived* rather than assigned are
marked `(derived)` and counted in a note — that is a data-hygiene finding, not a
detail.

### Free capacity

```
free_minutes = workday_minutes − (pending tasks × 20 min)
```

The 20 minutes is an **assumption**, printed as a standard so it can be argued
with. Pending work is `work_assignments` in `OPEN`/`ASSIGNED`/`IN_PROGRESS` plus
`ops_plan_tasks` in `open`/`in_progress`.

### The KPIs

Recommended person · their free capacity · top gap · eligible staff for it
(good ≥ 2 · watch ≥ 1) · roster pending · **unassigned pending** (nobody owns
these; good 0 · watch ≤ 5) · most loaded person.

### The tables

Who to send at the top 3 gaps · Roster load (every active staffer: stations,
floor tasks, desk tasks, urgent, overdue, scans today, free minutes, verdict) ·
Unowned pending work.

### What it does not do

**It does not assign anyone.** The report names who; you make the call. The verb
is `POST /api/tasks` (permission `work_orders.claim`) — the same one the floor
uses. The artifact panel is a read plane by law
(`src/lib/assistant/session-surface-cohort.ts`), and no renderer may import write
machinery.

Desk urgency comes from `due_at` only — `ops_plan_tasks` has no priority column.

---

## Where the numbers live

| Piece | Path |
|---|---|
| Artifact contract | `src/lib/assistant/ui-artifacts.ts` (`artifactReportSchema`) |
| Shared formatting + verdict rules | `src/lib/reports/report-kit.ts` |
| The five builders | `src/lib/reports/{packing-performance,unbox-backlog,order-value-rank,roi-rank,delegation-plan}.ts` |
| The five tools | `src/lib/assistant/tools/report-tools-{packing,inbound,roi}.ts` |
| Registration | `src/lib/assistant/tools/index.ts` |
| Sentence routing (local model) | `src/lib/assistant/tool-subsetting.ts` |
| Status line while it runs | `src/lib/assistant/tool-activity.ts` |
| Renderer | `src/components/session/artifacts/ReportArtifact.tsx` |
| Panel → model split | `src/lib/assistant/tool-artifact.ts` |
| Which model answers | `src/lib/assistant/assistant-mouth.ts` |

Tests: `src/lib/reports/*.test.ts` (38) · `npm run test:assistant` (258) ·
session cohort `src/lib/assistant/session-surface-cohort.test.ts` (27).
