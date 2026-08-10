# Plan — Arrival: directed staging placement + OS&D at the dock

**Trigger:** a WMS-industry-standards review of the Arrival station's door-flow plane
(`/triage` — identity → urgency/platform/type → staging → note dock). Two of the seven
candidate upgrades were scoped against the existing domain layer; this doc is that scope.

**Status:** PLAN — nothing here is implemented, and **§3's decisions are now out to research**
before either half is built. See
[`arrival-door-decisions-staging-and-osd-GEMINI-RESEARCH-BRIEFING.md`](./arrival-door-decisions-staging-and-osd-GEMINI-RESEARCH-BRIEFING.md),
which asks the prior question this plan assumes an answer to: **which inbound decisions belong
at the door at all.** That brief may conclude either half should be rewritten or not built —
§1 in particular assumes directed *dock staging* is a real industry practice rather than
something only done at putaway, and that assumption is untested.

**Lane:** `main` (dogfood). Attach to `:3050` — never start/restart/kill the dev server.
The user owns commits.

**Read first:** `.claude/rules/source-of-truth.md` (Scan-station centre lines display ·
Cross-entity urgency — the "never a fifth single-purpose writer" precedent §2.2 leans on) ·
`.claude/rules/display/station-workbench.md` (Arrival carve-out: centre = one white
door-flow plane, Displays = Pairing only) · `.claude/rules/pattern-evolution.md` ·
`.claude/rules/backend-patterns.md` (route skeleton, `Deps` injection, a safety
classification is a REQUIRED parameter).

---

## 0. What this plan does NOT do

- **It does not touch `putaway-placement.ts`.** That module answers "which inventory bin
  does an ACCEPTed unit land in at `mark-received`" (one org-default bin, `UNSORTED`).
  Dock staging is a different job with a different lifetime and different consumers.
  Overloading it would make one decision table serve two questions that diverge the moment
  a tenant configures either.
- **It does not change `workflow_status`, and it does not add a blocking quarantine.**
  Whether a dock `DAMAGED` should make a carton un-allocatable is a status-machine
  question, `transition()` is a hard law, and it is ask-first. See §3.1.
- **It does not add a single new exception code**, and therefore touches neither
  `seedOrgCatalog` nor the `sort_order` array-position contract that
  `exception-codes.ts`'s header warns about at length. All four dock codes already exist.
- **It does not move OS&D onto the Arrival Displays column.** Arrival's Displays is
  Pairing-only by rule; condition-on-arrival is door-flow and stays in the centre plane.
- **It does not build the carrier-claim hand-off.** That is real value (§3.2) and a
  separate piece of work.

---

## 1. Directed staging placement

> ⚠ **Blocked by a prerequisite found 2026-08-09 — build
> [`station-location-scan-placement-PORT-HANDOFF.md`](./station-location-scan-placement-PORT-HANDOFF.md)
> first.** Arrival's staging fields have zero human writes not because operators
> don't stage, but because **the only way to record a shelf is a mouse-driven
> `<select>` on a wedge-scanner bench** — a location scan on the open carton does
> nothing (it commits only inside an armed `batch_sort` batch session). A
> suggester for a control nobody can physically use is worthless. Make placement
> **recordable** first; that also produces the usage data this section's rule
> table (§3.4) needs in order to be written from evidence rather than guesswork.

Industry standard: the WMS suggests a primary bin, a secondary if the primary is full, and
overflow, derived from item characteristics, zone rules, and current occupancy — removing
tribal knowledge and the training time that goes with it.

Today the shelf is a bare `Select a shelf…` dropdown grouped by room
([`StagingSection.tsx:192`](../../src/components/receiving/triage/StagingSection.tsx)).
Placement is entirely operator memory.

### 1.1 What already exists (verified, not assumed)

| Concern | Where | State |
|---|---|---|
| Decision-table pattern over the shared evaluator | [`triage-lane-policy.ts`](../../src/lib/receiving/triage-lane-policy.ts) | **Done** — pure `DecisionRule[]`, `resolveDecision`, manual-override-wins |
| Same pattern, second instance | [`putaway-placement.ts`](../../src/lib/receiving/putaway-placement.ts) | **Done** (different job — see §0) |
| Storage | `receiving_triage.staging_location_id` + `priority_lane` | **Done** |
| Write path | [`PATCH /api/receiving/[id]`](../../src/app/api/receiving/[id]/route.ts) (~line 670) | **Done** — already rejects a location that isn't active for the org |
| Shelf catalog | `Location` (`room · row_label · col_label · bin_type · zone_letter · barcode · capacity`) via `/api/locations` | **Done** — client filters to real bins (row+col non-null) |
| **Live carton occupancy per shelf** | [`/api/receiving/triage/staging-map`](../../src/app/api/receiving/triage/staging-map/route.ts) + [`useTriageStagingMap.ts`](../../src/components/sidebar/receiving/useTriageStagingMap.ts) | **Done and already fetched** — group by `staging_location_id`. No new endpoint, no new query |
| Shelf-as-scannable-destination | [`useArrivalBatchSortSession.ts`](../../src/components/sidebar/receiving/useArrivalBatchSortSession.ts) `commitBatchToLocation` | **Done** — scan shelf barcode → assign N cartons + auto-lane |

The only missing piece is the policy itself.

### 1.2 The trap — `capacity` does not mean carton count

[`location-queries.ts:350`](../../src/lib/neon/location-queries.ts) computes `fill_pct` and
`is_over_capacity` from `SUM(bin_contents.qty)` — **SKU units stocked in the bin**. A carton
staged at the dock writes nothing to `bin_contents`.

So a suggester that filters candidates on `capacity` would read a putaway bin's stock level
and declare a dock shelf full for an unrelated reason. **Carton occupancy comes from
`staging-map` counts; `capacity` stays out of the rule** unless and until a separate,
explicitly-named carton-capacity field exists.

This is the one thing in §1 that would have shipped silently and looked correct.

### 1.3 Design

A third sibling in the same family — `src/lib/receiving/triage-staging-placement.ts`, pure
and DB-free:

```ts
export const TRIAGE_STAGING_CATEGORY = 'triage-staging';

/** Folds dock facts into the shared `channel` fact — same trick as triageLaneChannel,
 *  so `DecisionFacts` is not widened for one caller. */
export function triageStagingChannel(facts: StagingFacts): StagingChannel;

/** System-default table: first-match-wins, org-overridable later via a /studio node. */
export function receivingStagingPlacementPolicy(): DecisionRule[];

/** Manual assignment ALWAYS wins — mirrors resolveTriageLane exactly. */
export function resolveStagingPlacement(
  manualLocationId: number | null | undefined,
  facts: StagingFacts,
  candidates: StagingCandidate[],   // injected: locations + live carton counts
  rules?: DecisionRule[],
): StagingSuggestion | null;
```

Two properties carried over from the siblings deliberately:

- **The rule emits a zone / `bin_type` SYMBOL, not a location id.** Both existing policies
  emit symbols (a lane value, a bin barcode). The caller resolves symbol → concrete shelf
  by picking the least-occupied candidate. That keeps the table small enough for a human to
  read, keeps the module pure, and puts "which specific shelf" in a dep.
- **Manual wins, forever.** Same relationship `priority_lane` already has to its auto-route
  and `priority_tier` has to `is_priority`.

**The pleasing inversion:** [`useTriageStaging.ts:95`](../../src/components/receiving/triage/useTriageStaging.ts)
currently derives **lane from shelf**. The suggester derives **shelf from the same facts the
lane already reads** (`isReturn`, `isPriority`, plus `intake_type` / repair-linkage). Both
then fall out of one fact set and cannot disagree with each other.

### 1.4 File-level work

| # | File | Change |
|---|---|---|
| 1A | `src/lib/receiving/triage-staging-placement.ts` | **NEW** — policy + channel fold + resolver |
| 1B | `src/lib/receiving/triage-staging-placement.test.ts` | **NEW** — `node:test` + `tsx`, DB-free (the `putaway-placement.test.ts` shape) |
| 1C | `useTriageStaging.ts` | Consume `useTriageStagingMap` for occupancy; expose `suggestedLocationId` + `suggestionReason` |
| 1D | `StagingSection.tsx` | Mark the suggested `<option>`; prefill when `stagingLocationId == null`; render the reason under the select |
| 1E | `.claude/rules/source-of-truth.md` | One row: staging placement resolves in exactly one place |

**No migration. No new route. No new query.**

### 1.5 Guard

`triage-staging-placement.guard.test.ts` — the suggester is the only shelf-suggestion
resolution point, and `capacity` is not read as a carton ceiling (a grep-shaped assertion,
because that is the mistake §1.2 describes and prose cannot fail).

---

## 2. OS&D at the dock

Industry standard: receivers generally must report visible damage or shortage to the carrier
within ~48 hours to preserve a claim. Damage is most visible at the dock and least visible at
the bench.

### 2.1 What already exists

The vocabulary is complete and carefully governed.
[`exception-codes.ts`](../../src/lib/receiving/exception-codes.ts) carries four
sub-vocabularies under one `flow_context`, and **all four codes the dock needs already
exist**: `DAMAGED · SHORT · OVER · WRONG_ITEM`.

That kills the riskiest part of the job. No new code means no `seedOrgCatalog` walk, no seed
migration, and no exposure to the array-position `sort_order` contract that would otherwise
renumber every photo-override and loss code for pre-existing orgs.

Also done:

- [`ReasonChipPicker.tsx`](../../src/components/ui/ReasonChipPicker.tsx) with two live
  consumers (`ReceivingQaFailSheet`, `PhotoPolicyOverrideSheet`) — a compose, not a build.
- A full photo stack: `photo-policy.ts` → `photo-policy-gate.ts` → `photo-policy-override.ts`.
- Photo capture at Arrival (the identity bar camera), which is what Unbox's `arrival_check`
  step already reads.
- `emitEntitySignalSafe` fires on every exception write.

### 2.2 The blocker — the exception writer is line-level, and the dock has no lines

[`exceptions.ts`](../../src/lib/receiving/exceptions.ts) says so in its own docblock:

> NOT moved here (genuinely carton-level, stays on `receiving`): the NO_PO /
> CARRIER_MISMATCH scan exception on an UNFOUND carton that has no lines yet

`recordReceivingException` requires a `receivingLineId`. At Arrival a carton is routinely
**unfound or unpaired — it has no lines at all**, which is exactly the arrival most likely to
be damaged and least likely to have a PO to hang the fact on.

**The architecture already answers this, and the answer is right on the merits.** *"The box
arrived crushed"* is a **package fact** — the same category the module cites to keep
`return_reason` carton-level. So dock OS&D belongs on `receiving_carton.exception_code`.
This is consistent with the existing design, not a workaround.

**The catch:** that column has exactly one writer today, and it is an inline `UPDATE` in a
route — [`lookup-po/route.ts:654`](../../src/app/api/receiving/lookup-po/route.ts), fired
automatically at scan time. Adding an operator-facing write as a *second* inline UPDATE is
precisely the shape the cross-entity-urgency ruling exists to prevent ("never a fifth
single-purpose writer" — `source-of-truth.md`). So work item 2A is extracting one
carton-level writer and migrating `lookup-po` onto it, in the same change.

### 2.3 Design

- **Domain.** `recordCartonException(orgId, { receivingId, exceptionCode, reason, createdBy })`
  beside the line-level writer, `Deps`-injected (default real impls) so it unit-tests DB-free,
  emitting the same `emitEntitySignalSafe` signal the line-level writer does.
- **Vocabulary.** A narrow exported `DOCK_EXCEPTION_CODES = ['DAMAGED','SHORT','OVER','WRONG_ITEM']`,
  validated **server-side**, following the exact precedent of `PHOTO_POLICY_OVERRIDE_CODES`
  and `LOSS_EXCEPTION_CODES`. An operator must not be able to file a loss code or claim a
  photo waiver from the dock, and `NO_PO` / `CARRIER_MISMATCH` stay automatic.
- **Route.** `POST /api/receiving/[id]/exception` on the house skeleton: `withAuth` +
  permission → validate → domain helper → 404/409/200 → `recordAudit`.
- **UI.** A `CONDITION ON ARRIVAL` row in the door-flow plane, peer of URGENCY / PLATFORM /
  TYPE, composing `ReasonChipPicker`. Centre plane, not Displays (Arrival's Displays is
  Pairing-only).
- **Photo.** Require ≥1 photo when `DAMAGED`. **Its own dock-time check, not
  `photo-policy-gate`** — that gate is a receive-time construct keyed to `mark-received`, and
  coupling two gates with different triggers is how one of them ends up wrong.

### 2.4 File-level work

| # | File | Change |
|---|---|---|
| 2A | `src/lib/receiving/exceptions.ts` (or a `carton-exceptions.ts` sibling) | **NEW writer** `recordCartonException` + migrate `lookup-po` onto it |
| 2B | `src/lib/receiving/exception-codes.ts` | **NEW** narrow `DOCK_EXCEPTION_CODES` const (no new codes) |
| 2C | `src/app/api/receiving/[id]/exception/route.ts` | **NEW** route |
| 2D | [`TriagePanel.tsx`](../../src/components/receiving/triage/TriagePanel.tsx) | **NEW** `CONDITION ON ARRIVAL` row composing `ReasonChipPicker` — mounted **in `TriagePanel`'s own composition**, beside `TriageClassifySection`, *not inside it*. See the trap below |
| 2E | dock photo check | Require a photo for `DAMAGED` |
| 2F | `.claude/rules/source-of-truth.md` | One row: carton-level exceptions have one writer |

**The trap in 2D — `TriageClassifySection` is not Arrival-only.** It looks like Arrival's own
classify block (Urgency / Platform / Type / repair identify) and it renders those four rows on
the door-flow plane, but it is **shared with Unbox**: mounted by
[`unbox-tabs.tsx`](../../src/components/receiving/workspace/line-edit/terminal/unbox-tabs.tsx)
(lines 252, 334) and by `ClassifyDockControl` for the unfound dock walk. Adding the OS&D row
*inside* that component would silently put a dock-condition control on the Unbox bench, where
the carton is no longer at the door and the 48-hour claim reasoning does not apply.
`TriagePanel` composes classify and staging as siblings — the new row goes there.

### 2.5 Guards

- `carton-exception-writer.guard.test.ts` — exact-set allowlist of `receiving_carton.exception_code`
  writers, **shrink-only** (finishing a migration removes a line; nothing may add one). Same
  shape as `urgency-sot.guard.test.ts`.
- Extend `exception-codes.test.ts` — `DOCK_EXCEPTION_CODES` is a strict subset of
  `OSD_EXCEPTION_CODES` and excludes every loss / photo-waiver / QA-fail code.

---

## 3. Decisions needed before §2 is built

Both change the writer's shape, which is why §2 waits.

### 3.1 Does a dock `DAMAGED` block anything downstream?

Standard quarantine is a **system-enforced interlock** — blocked from allocation, movement
and shipment until a qualified decision is posted. Today `exception_code` is deliberately
orthogonal to `workflow_status`, which is correct and which this plan does not propose
changing.

If damaged cartons should be genuinely un-allocatable, that is a status-machine change,
`transition()` is the only legal path, and it is **ask-first**. Scope it separately.

**Recommendation:** ship §2 non-blocking first. A recorded, photographed, queryable damage
fact is most of the value; the interlock is a second decision with real blast radius.

### 3.2 Does filing `DAMAGED` pre-seed the carrier claim?

The exception row already carries `zendesk_ticket`, and the Arrival identity bar already has
a `CLAIM` button. Wiring code + photo into the claim draft is where the 48-hour window turns
into money — but it is a third piece of work, not a free rider on §2.

### 3.3 (§1, minor) Prefill or auto-save?

`selectShelf` currently saves immediately on change. A suggestion can either **prefill and
wait for the operator** or **auto-apply with a visible override**. A wrong suggestion that
auto-saves is worse than no suggestion; prefill is the safer default.

### 3.4 (§1, business input) The rules themselves

The policy table is only as good as its rules, and the rules are warehouse knowledge, not
code — which zones take returns, which take priority POs, where repair-linked cartons go.
**This needs the operator's input before 1A is written.** The module is cheap; the table is
the product.

---

## 4. Sequencing and sizing

| | Size | Blocked on | Value |
|---|---|---|---|
| **§1 staging placement** | **Small** — one pure module, one hook field, small UI, no migration / route / query | §3.4 (the rules) | Every carton, every shift |
| **§2 dock OS&D** | **Medium** — ~3–4× §1: writer extraction + route + UI row + photo rule + two guards | §3.1, §3.2 | Higher — carrier-claim windows are money |

**Do §1 first.** Self-contained, no rulings pending, no new writer, and it improves a control
the operator touches on every carton. §2 is the higher-value item, but doing its writer twice
would cost more than waiting for §3.1–3.2.

---

## 5. Test & verification plan

- **Unit (DB-free):** `triage-staging-placement.test.ts`, `recordCartonException` with fakes
  (the `Deps`-injection pattern — assert both the return value and what was threaded into the
  injected deps).
- **Guards:** as listed in §1.5 and §2.5. Baselines shrink only; never raise one to land a change.
- **E2E:** against the **QA org** (`--project=qa-desktop`), never the dogfood tenant. Note the
  QA org's Unbox rail is empty (`UNBOXED · 0`) — Arrival (`/triage`) is the station with rows,
  which is also the surface both items target.
- **`npm run verify`** before done. ⚠ It is currently red from a **concurrent session's**
  in-flight edits (see `masternav-monochrome-and-instant-HANDOFF.md` §7) — run the failing gate
  against the files this work owns before assuming the red is yours, and report pre-existing
  failures rather than silently fixing them.

---

## 6. Compound opportunities

- **Do now (in scope, low blast radius):** §1 lands a third instance of the decision-table
  pattern, which is the point at which it is worth a one-line rules row naming the family —
  policy tables are pure, emit symbols, and let manual override win.
- **Promote next (2+ call sites):** the symbol → least-occupied-candidate resolver is
  reusable the moment a second surface suggests a location (bin putaway, returns grid).
- **Deferred (ask first):** the quarantine interlock (§3.1), the claim hand-off (§3.2), and
  a real carton-capacity field on `locations` (§1.2).

---

## 7. Five other candidates from the same review — not scoped here

Two of the five are now **out to research** in their own validation brief —
[`arrival-kpi-and-door-lpn-PLAN-VALIDATION-GEMINI-RESEARCH-BRIEFING.md`](./arrival-kpi-and-door-lpn-PLAN-VALIDATION-GEMINI-RESEARCH-BRIEFING.md):
**dock-to-stock + receiving accuracy as Arrival's KPIs**, and **printing the carton license
plate at the door instead of the bench**. That brief corrects a claim made in this plan's
first draft: `TriageKpiStrip` does not render "exactly one number" — it renders **none**,
because the flag its metric depends on is true on 0 of 2474 dogfood rows.

The remaining two — **a cross-dock fast lane** and an **expected-today manifest** — are briefed in
[`arrival-manifest-and-crossdock-PLAN-VALIDATION-GEMINI-RESEARCH-BRIEFING.md`](./arrival-manifest-and-crossdock-PLAN-VALIDATION-GEMINI-RESEARCH-BRIEFING.md).
All five candidates from the original standards review are now either scoped or out to research.

Explicitly rejected as not fitting single-unit used goods: SSCC/EDI 856 pallet ASNs, FEFO and
lot/expiry quarantine, allergen segregation, voice-directed putaway, ABC velocity slotting.

**Sources (industry standards cited above):**
[Helm WMS — system-directed putaway](https://helmwms.com/en-us/glossary/system-directed-putaway) ·
[ShipHawk — receiving, putaway, cross-docking](https://shiphawk.com/solutions/warehouse-receiving-putaway-cross-docking/) ·
[Logimax — exception handling](https://www.logimaxwms.com/glossary/exception-handling/) ·
[OS&D definition](https://climbtheladder.com/what-is-osd-overages-shortages-damages-and-claims/) ·
[SG Systems — quarantine / quality hold](https://sgsystemsglobal.com/glossary/quarantine-quality-hold-status/) ·
[Cleverence — WMS receiving workflows, KPIs](https://www.cleverence.com/articles/business-blogs/wms-receiving-3846/)
