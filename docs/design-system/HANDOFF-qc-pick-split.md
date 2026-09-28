# Handoff prompt — split Quality Control and Picking in the data + API layer

Paste everything below the line into a fresh session.

---

You are splitting **Quality Control (QC)** and **Picking** into two independent facts in CycleForge's
data and API layer, in the `prod` worktree (`/home/michaelgarisek/Projects/cycleforge-lanes/prod`).
Read `AGENTS.md` first. Dev origin is `http://localhost:3050` ONLY (lane unit
`cycleforge-lane@prod`). DSNs live in the worktree `.env`. The owner reviews phase by phase — one
change set per phase, typecheck + lint the touched files, `pnpm verify:fast` before handing a phase
back, then stop and report.

Shared dirty tree (~450 paths, several sessions). Never commit without asking; re-read a file right
before editing it; never revert what you did not write. **Another session owns the To-ship card list
UI** (`src/components/outbound/orders/cards/**`, `order-link-editors.tsx`, `tokens/desk-stage.ts`)
— do not edit those; see "Contract with the card list" for what you hand it.

Read first:
- `docs/design-system/RESEARCH-qc-pick-stations.md` — the full map of both stations, every writer,
  every reader, schema and assignments (path:line, 2026-09-27). **Re-verify lines before editing.**
- `docs/design-system/BRIEF.md` §13 — the card's QC / Pick / Pack stage rulings and "One stage source".
- Skills: `db-migration-author` (hand-written SQL migrations), `org-scope` (tenant-scoped routes),
  `new-route` (API route shape), `domain-unit-test` only if the owner asks for tests.

## The problem (verified)

One scan is counted as two different facts, so neither can be trusted:

- The desktop "Picker" desk (`/test?ship=urgent`, SIDEBAR label "Picker") calls `POST /api/tech/scan`
  (`src/app/api/tech/scan/route.ts` ~L442-458), which writes `station_activity_logs`
  `station='TECH'`, `activity_type='TRACKING_SCANNED'`.
- The To-ship feed reads that SAME row as **QC** (`src/lib/orders/orders-list.ts` CTE `test_activity`
  ~L244-255, plus `next_test_activity`, `test_duration`) AND as **Pick** (`PICK_FACTS_LATERALS` third arm
  `pick_station`, `src/lib/neon/orders-queries.ts` ~L128-138). Same staff, same timestamp, two stages.
- Assignments borrow too: there is no `PICK` work type (`src/app/api/assignments/route.ts` ~L18:
  `TEST, PACK, REPAIR, QA, RECEIVE, STOCK_REPLENISH`). The "Picked by" assignee is
  `work_assignments.work_type='TEST'` (`orders-list.ts` `wa_t` → `tester_id`;
  `src/app/api/orders/assign/route.ts` ~L94-98 writes `testerId` as TEST).
- `src/lib/station-activity.ts` has no `PICK` station and no pick activity type.
- Readers that inherit the conflation: `orders-list.ts`, `orders-queries.ts` (4 projections),
  `field-catalog/orders-resolve.ts` (`pickedStep`), `src/lib/orders/order-stages.ts`,
  `useOrdersQueueFeed.ts` (`queueRowStaff`, `handleCommitStageAssign`), `OrderRecordView.tsx`
  (QC by / Picked by), `orders/queue-counts`, `orders/desk-counts`, `operations/kpi-table`,
  `lib/operations/journey.ts` + assistant `get_operations_journey`.

## The model to build toward (owner, 2026-09-27)

QC and Picking are **opposite ends of one spectrum**:

| | QC | Pick |
|---|---|---|
| Born from | **Receiving / inbound** (a unit arrives, is inspected) | **An order** (a unit is taken from stock for it) |
| Grain | the **unit** (serial unit / receiving line) | the **order line ↔ unit allocation** |
| Station | the QC bench (`/test` testing view, `/m/u/[id]/qc`, `/m/qc/line/[id]`, `POST /api/serial-units/[id]/test`, `/api/tech/test-result`, checklists) | the pick station (`/m/pick`, `POST /api/pick/scan`, `picking_sessions`, `order_unit_allocations` → `PICKED`, `inventory_events` `PICKED`/`FORCE_PICK`) and the desktop Picker desk |
| Assigned as | a QC work type | a PICK work type (new) |

Both orders of work must be representable and **identifiable**:

1. **QC ahead** — unit received → QC'd → in stock → ordered → picked → packed. The order's QC is
   *inherited* from the unit (a pass that predates the order).
2. **Order first** — ordered → picked (in stock, or out of stock and waiting) → QC'd → packed.
3. **Out of stock** — nothing to pick; pick waits, QC waits.

An order line's QC fact is therefore "the QC verdict of the unit allocated to it" (with its time,
actor, verdict, and whether it predates the order), never a shipment-level TECH scan.

## The display this data must feed (built 2026-09-27 — the target your facts light up)

The To-ship card, its Space quick look and the order record already render this. Nothing here
is yours to build; it tells you exactly which facts each pixel needs.

```
┃ ☐ #5043 ↗  ● Ecwid · Jane D.                 Listing ↗   ● Due today
┃   [📷] Shimano XT derailleur  ×1 · Used · Bin A-14      🔍 Picked 2:14 PM   🛡 Pre-QC'd Sep 20
┃   [📷] Chain 12-speed         ×1 · New  · Bin B-02      🔍 Out of stock     🛡 QC
┃   +1 more                                                ☑ Pack
```

- **Order of stages everywhere: Pick → QC → Pack** (card, quick look, record rows "Picked by → QC
  by → Packed by → Scanned out by"). Owner adopted it 2026-09-27.
- **Grain.** Pick and QC are per ORDER LINE (the unit allocated to that line); Pack is per ORDER.
  Orders with 2+ lines always show up to 3 lines (out of stock first), "+N more" for the rest.
- **One chip per stage:** icon + word + one short stamp. Word / tone per state, and the field that
  drives it:

  | Chip reads | Tone | Driven by |
  |---|---|---|
  | `Picked` + stamp | info blue | pick `done` + `at`/`atShort` (a real PICK event for that line) |
  | `Out of stock` | danger | pick not done + `blocked: 'out_of_stock'` |
  | `Pick` (faint) | faint | pick not done, not blocked |
  | `QC'd` + stamp | success green | qc `done` + stamp (a QC verdict on the line's unit AFTER the order) |
  | `Pre-QC'd` + stamp | success green | qc `inherited: true` (a PASS on the unit that predates the order) |
  | `QC` (faint) | faint | no QC verdict on the line's unit |
  | `Packed` + stamp | Packed purple | order pack `done` + stamp |
  | `Pack` (faint) | faint | not packed |

  Stamp: `atShort` — today (PST) → time only, older → date only. Full stamp `at` in the popover.
- **Names are never inline.** A click on a chip shows: who did it (`who`, from the ACTOR's staff id),
  or "Assigned to X" (`who` from the stage's ASSIGNMENT when not done) / "Not assigned"; the full
  `at`; for Pick / Pack the assign control (pick → that line, pack → every line). That means:
  **pick assignment must be a real PICK work assignment per order (or per line), QC must have its
  own assignment if the owner wants QC assignable** — today pick borrows the TEST assignment.
- **Needed fields per line** (on `ShippedOrder` rows the feed returns): pick actor id + name + raw
  time; QC verdict + actor id + name + raw time + whether it predates the order (or the order's
  created time so the model can compare); out-of-stock (already present). Per order: pack actor +
  raw time (present), pack and pick assignees.
- If you add `verdict`, the display will read `QC failed` (danger) / `Retest` (warning) — add the
  field and note it; the card session renders it.

## Phases (one at a time; stop after each)

0. **Research (no code) — foundational, first principles.** Produce
   `docs/design-system/RESEARCH-qc-pick-model.md` answering, with sources:
   - How established systems model inbound inspection vs outbound pick/QC and the unit vs order
     grain: Shopify (fulfillment orders, locations), ShipStation, NetSuite WMS, Manhattan / Oracle
     WMS (receiving inspection, pick waves, pack verification), Linnworks / Veeqo, refurbished-goods
     sellers (graded units, per-serial test records). Primary docs only; cite URLs.
   - The minimal fact set each stage needs (event, grain, actor, time, verdict, source station) and
     which facts are events vs derived state.
   - Every CycleForge writer and reader involved (start from `RESEARCH-qc-pick-stations.md`), what it
     writes today, what it should write, and what historical rows mean (can the Picker desk's
     `TECH/TRACKING_SCANNED` rows be told apart from bench QC rows — URL, metadata, staff role, time
     window? Measure it in the dev DB, don't guess).
   - **Display research for the card list** (the other session will build it; you supply the model):
     how a triage list shows per-line pick + per-unit QC + per-order pack at a glance; how "QC'd
     before the order" (inherited) vs "QC'd after pick" reads; how an out-of-stock line reads; the
     one-column time stamp (today → time only, older → date only; full stamp on click); names off
     the list, on click. Recommend one display grammar with a small ASCII mock.
   - Proposed schema + API changes and a migration/backfill plan with rollback. Stop; the owner rules.
1. **Vocabulary + schema.** Per the ruling: a `PICK` station and pick activity type(s) in
   `station-activity.ts`; a `PICK` work type for `work_assignments` (migration via
   `db-migration-author`, idempotent, org-scoped); any unit-level QC fields/view the research calls
   for (e.g. latest QC verdict per serial unit with time/actor). Write files; the owner applies via
   `/db-migrate`.
2. **Writers.** The Picker desk (`/api/tech/scan` in pick mode) writes a PICK fact (and advances
   `order_unit_allocations` where allocations exist, per the ruling); the QC bench keeps writing
   `TECH` verdicts keyed to the unit. No writer produces a row that both readers count.
3. **Readers.** `orders-list.ts` / `orders-queries.ts` / `orders-resolve.ts` read Pick only from pick
   sources and QC only from unit QC (inherited through the allocation); `picker_id`/`picker_name`
   from the PICK assignment, `tester_*` stays QC. Migrate every reader in the list above
   (counts, KPI, journey, assistant) in the same phase — no reader left on the old conflation.
4. **Assignments API.** `/api/orders/assign` accepts a picker separately from a tester;
   `handleCommitStageAssign('orders.picked')` writes PICK. Backfill: existing TEST assignments that
   were really pick assignments → PICK (by the rule the research found), with a dry run first.
5. **Verification.** For a handful of real orders (include order `5043`, row id 13963 — it has only
   TEST + PACK assignments, no scans), show before/after QC and Pick facts from the feed
   (`/api/orders` at `:3050`) and prove no single event appears as both.

## Contract with the card list (the other session)

The front end is ALREADY BUILT against this contract (2026-09-27) — your job is to make its fields
true. The card, quick look and record read stages only through `src/lib/orders/order-stages.ts`:

- `ORDER_STAGE_KINDS = ['pick','qc','pack']` (default order Pick → QC → Pack), `currentOrderStage`.
- `orderStage(row, kind, { todayKey, staffName?, outOfStock? })` →
  `OrderStage { kind; label; done; who; staffId; at; atShort; inherited; blocked }`:
  `at` full PST stamp; `atShort` today → time, older → date; `inherited` = QC pass predates the
  order ("Pre-QC'd", counts as done) — **hard-coded false today, you fill it**; `blocked:
  'out_of_stock' | null` on a pending pick.
- Grain (`src/lib/orders/order-card-model.ts`): each `OrderCardLine.stages = { pick, qc }` from that
  line's own row; `OrderCardModel.pack` once per order; `OrderCardModel.stages` the order-level
  [pick, qc, pack] summary.

Today pick and QC per line still come from the conflated feed (same shipment scan), and `inherited`
is always false — the display is ready, the data is not. You MAY change the internals of
`order-stages.ts` and the `ShippedOrder` fields it reads; keep these field names/meanings, extend
additively (e.g. `verdict: 'pass'|'fail'|'retest'|null`), and document each new field there. Hand
back a short note per phase listing new/changed fields. Do not change the card UI yourself.

## Rules

- Tenant scope: every new query/route filters `organization_id`; follow `org-scope`.
- Migrations: dated, idempotent, one concern each; never edit an applied migration; never `db:push`.
- URL state on desks: `readLiveSearchParams` + `window.history.replaceState`, not `router.replace`.
- Mobile-first law (`docs/mobile-first/SURFACE_LAW.md`): `/m/pick` and `/m/u/[id]/qc` keep working.
- Before calling a phase done: `npx tsc --noEmit -p tsconfig.json` (filter to touched files),
  `npx eslint <touched files> --quiet`, `pnpm verify:fast`. Report red that belongs to other sessions
  by file; do not fix their work.

## Open questions for the owner (ask in phase 0's report)

1. Is the desktop "Picker" desk (`/test?ship=urgent`) a pick station only, or pick + QC in one pass?
   If one pass, which scan is which?
2. Does a QC pass on a unit before the order count as the order's QC ("inherited"), or must QC
   happen per order?
3. Should a desktop pick scan of a tracking number advance every allocated unit to `PICKED`, or must
   each serial be scanned?
4. Historical `TECH/TRACKING_SCANNED` rows: reclassify by rule, or apply the split only from a
   cutoff date?
5. Is a failed QC after pick a return-to-stock (release allocation) or a hold on the order?

## Delete-first cut list (verified 2026-09-27 — read this instead of re-mapping)

### Measured facts (dev DB + source)

- `TECH/TRACKING_SCANNED` has ONE live writer: `metadata.source='tech.scan'` (3267 rows, 2026-03-31 → 09-25),
  plus `tech.scan.backfill` 506 and 21 with no source. UI emitter chain: `ShippingScanBand.tsx:77` →
  `useDeskPickController` (sole mount) → `hooks/station/handleTrackingScan.ts:26` → `/api/tech/scan`.
  That band is the Picker desk (`/test` default and `/test?ship=urgent`). The QC bench (`?view=testing`)
  never writes it; bench QC lands in `testing_results` (241 rows).
- Metadata cannot split historical rows (one `source` value). Reclassification = "all are Picker-desk
  scans" or a cutoff date; there is no per-row rule.
- `work_assignments` ORDER: `TEST` 5018, `PACK` 4033, no pick type. Native pick data: 51 allocations
  PICKED+, 17 `picking_sessions`.
- Code already half-agrees: `src/lib/search/find-events-from-sources.ts:250` titles `TRACKING_SCANNED`
  as **Picked**; the writer still fires `publishOrderTested` (`api/tech/scan/route.ts:488`).
- Bug found: `orders-list.ts` `tester_id` (:427) is the TEST **assignee** (`wa_t`), but `tester_name`
  (:466) is `staff_test_assignee` = `test_activity.staff_id` (:727), the **scan actor**. Same row, two people.

Conclusion: the scan is a pick fact; the **QC reading of it is the lie**. Pending owner Q1 ("pick only?").

### Cut 1 — QC readers of the pick scan (no migration; replace with unit QC in the same change)

Replacement needs no schema: QC = latest `testing_results` verdict for the unit in `order_unit_allocations`.
- `src/lib/orders/orders-list.ts`: CTEs `test_activity` :244-255, `next_test_activity` :256-270,
  `test_duration` :289-306; projections :441-444 (`tested_by`, `test_activity_at`,
  `next_test_activity_at`, `test_duration`), :466-467 (`tester_name`, `tested_by_name`); joins :722-723,
  :725, :727.
- "Tested" lane membership: `src/lib/orders/order-grain-sql.ts:59` (`TECH_TEST_ACTIVITY_TYPES`),
  `src/lib/orders/feed-membership-projection.ts:128,145` (`has_tech_scan`), constant
  `src/lib/station-activity.ts:28-29`.
- `src/lib/orders/order-stages.ts:37-39` QC branch (reads `test_activity_at`).
- From the research doc, not re-verified: `orders/queue-counts`, `orders/desk-counts`,
  `operations/kpi-table:289`, `lib/operations/journey.ts`.
- Field fan-out is ~45 files (`test_activity_at`, `tested_by_name` in `OrdersQueueTableRow.tsx:431-434`,
  `orders-queue/helpers.ts:132-160`, `shipping-information/helpers.ts:130,155`, ...). Change what the
  fields MEAN in SQL; do not rename them in Cut 1.
- Open: `SERIAL_ADDED` (`tech.serial`, 2515 rows) → `tsn.tested_by` is the `orders-queries.ts` QC source
  (:320). Check whether serials are added at the Picker desk (`handleSerialScan`) before trusting it as QC.

### Cut 2 — pick assignment borrowing TEST (after the PICK work-type migration)

- `src/lib/orders/orders-list.ts`: :427 `tester_id`, :494 + :728 `staff_pick_assignee` → `tester_color_hex`,
  `wa_t` :563-574 (feeds "picker").
- `src/lib/orders/order-stages.ts:47` pick `assignee: [row.tester_id, row.tester_name]`.
- `src/components/dashboard/orders-queue/useOrdersQueueFeed.ts:342-345` (`orders.picked` → `testerId`),
  `queueRowStaff` :67-81.
- `src/components/outbound/orders/OrderRecordView.tsx:579-581`.
- `src/components/outbound/orders/OutboundOrdersLedger.tsx:715`, `:917-920` (missing from research doc).
- `src/components/dashboard/orders-queue/queue-row-compare.ts:47-49` (Picked column sorts by tester names)
  and its pin `queue-row-compare.test.ts:115-124`.
- `src/app/api/orders/assign/route.ts:96-98`.
- Keep the `'orders.picked' | 'orders.packed'` union: `cards/OrderCard.tsx:257-260` (card session) types it.

### Cut 3 — last: the `pick_station` arm, once the desk writes a PICK row

Do NOT cut first: it is the only live pick signal; the owner reversed a Pick blanking on 2026-09-14.
- `src/lib/neon/orders-queries.ts:111-138` and the third COALESCE arg at :140, :316, :318, :468, :750,
  :752, :902; `src/lib/orders/orders-list.ts:478, :481`.
- Swap for a `station='PICK'` read; comments in `field-catalog/orders.test.ts:156, :221-222` name the arm.

### Do not touch

`src/components/outbound/orders/cards/**`, `order-link-editors.tsx`, `tokens/desk-stage.ts`.

## API route split (ruled 2026-09-27; data split applied the same day)

Data layer is done and migrated (PICK work type, PICK/PICK_SCANNED station rows, TEST→PICK
assignees, automation rules). The routes still say `tech`. Target:

**Picking** — taking units out of inventory for an order, or to move stock. Internal
`/api/picking/*` (web desks), public `/api/v1/picking/*` (phones, OpenAPI) unchanged — the same
internal-vs-v1 pairing as `/api/orders` vs `/api/v1/outbound`.

| New | Replaces |
|---|---|
| `POST /api/picking/desk/scan` | `/api/tech/scan` tracking branch (order pick scan) |
| `POST /api/picking/desk/serial` | `/api/tech/serial`, `add-serial`, `add-serial-to-last`, `undo-last`, `update-serials` |
| `POST /api/picking/desk/sku` | `/api/tech/scan-sku` (SKU pull from stock) |
| `GET /api/picking/desk/logs`, `/logs/counts` | `/api/tech/logs`, `/api/tech-logs`, `/api/tech/logs/counts` |
| `POST /api/picking/desk/delete` | `/api/tech/delete`, `/api/tech/delete-tracking` |
| `POST /api/picking/units/scan`, `/units/unscan` | `/api/pick/scan`, `/api/pick/unscan` |
| `GET /api/picking/queue` | `/api/pick/queue` |

**Not picking, leaving `/api/tech`:** FNSKU desk scan → `POST /api/fba/fnsku-scan`; repair
station scan → `POST /api/repair/station-scan`.

**Quality Control** — the unit is the grain. Per-unit writes stay on the resource
(`/api/serial-units/[id]/{test,checklist,grade,quality,failure-tags,hold,data-wipe,repairs}`,
`/api/receiving-lines/[id]/qc-checks`); `recordTestVerdict` is the one verdict writer. Workspace
reads move to `/api/qc/*`: `receiving-lines` (+`/open`), `recent`, `seller-claimed` ← `/api/testing/*`.
Future QC workspace verbs (bench sessions, diagnostics, triage) land under `/api/qc/*`.

**Deleted, no in-repo caller:** `/api/tech/test-result` (a second verdict writer),
`/api/tech/orders-without-manual`. `/api/tech`, `/api/pick`, `/api/testing` and `/api/tech-logs`
cease to exist; no redirects or aliases **in this worktree**. Deploy gate: the dev lane journal (21 days)
shows no non-probe hits on the old paths, but production traffic is not visible from here and
`scripts/check-mobile-endpoint-integrity.js` implies a phone client once used them. Check the
production access log for `/api/(tech|pick|testing|tech-logs)/` before this ships; if anything
external still calls them, add thin forwarding routes then, not before.

**Permissions + pages (done 2026-09-27):** `tech` now means Quality Control (category label
"Quality Control"; ids keep the `tech.` prefix). Picking has its own ids: `picking.view`,
`picking.scan`, `picking.substitute_unit` (replaces `tech.substitute_unit`); every
`/api/picking/*` route gates on them (a manifest test enforces it); `/api/v1/picking/*` stays on
`orders.view`. Grants: `2026-09-27c_picking_permissions.sql` (picking.view ← tech.view holders,
picking.scan ← tech.scan_serial holders; applied: 24 / 16 roles). The Picker desk lives at `/pick`
(`src/components/pick/**`, `PickSidebarPanel`); `/test` and `/tech` host QC only.

**Still open:** `/api/fba/fnsku-scan` and `/api/repair/station-scan` gate on `tech.scan_serial` but
are called from the `/pick` scan dispatcher; `/pick` has a sign-in redirect but no page-level
`picking.view` gate (the APIs are gated); stored `metadata.source` strings stay `tech.scan`.

## Phase 5 — verification (2026-09-27, after migrations)

Feed `/api/orders` at :3050: 438 rows; 0 rows where QC and Pick carry the same event; no
`next_test_activity_at` / `test_duration` keys. Desk scan smoke on order 15424 wrote one
`PICK/PICK_SCANNED` row, the feed showed Picked by Michael with QC empty; row then removed via
`/api/picking/desk/delete`. `POST /api/orders/assign {pickerId}` wrote ORDER/PICK.

| Order (row) | Before (QC · Pick · picker) | After (QC · Pick · picker) |
|---|---|---|
| 21-15107-47310 (13867) | staff 1 @09-08 22:42 · same scan · — | — · staff 1 @09-08 22:42 · — |
| 27-15114-23614 (14710) | staff 1 @09-25 21:51 · same scan · — | — · staff 1 @09-25 21:51 · — |
| 5085 (19448) | staff 1 @09-25 21:39 · same scan · — | — · staff 1 @09-25 21:39 · — |
| 5043 (13963) | — · — · 6 (stored as TEST) | — · — · 6 (PICK) |

"Before" is the pre-migration reading, reconstructed from `metadata.reclassified_from` and
`order_test_to_pick_backfill_2026_09_27`. QC is empty for every order because dev has 0 orders whose
allocated unit has a `testing_results` row.

### Note for the card-list session
- `OrderStage` gained `verdict: 'pass'|'fail'|'retest'|null` and `inherited: boolean` (QC only).
- Pick assignee = `picker_id` / `picker_name` / `picker_color_hex` (ORDER/PICK). Order-level
  `tester_*` are gone from `ShippedOrder` and every feed.
- New row fields: `qc_verdict`, `qc_inherited`, `has_pick_scan` (was `has_tech_scan`).
  Removed: `next_test_activity_at`, `test_duration`.
- Stage assign: `handleCommitStageAssign(row, 'orders.picked', …)` now writes PICK; the type is unchanged.

## Scale pass — pick/pack read paths (2026-09-27)

Measured on dev (43.7k `station_activity_logs`, 5.2k orders), EXPLAIN ANALYZE as owner:

| Change | Before → after |
|---|---|
| `sqlPackerOrderMatchLateral` (`src/lib/neon/packer-order-match.ts`) replaces 4 copies of the OR-form order match; `idx_stn_tracking_raw_key18` (`2026-09-27d`) | `/api/packerlogs?testedBy=` unbounded: 93 s timeout → 9.7 s; week view 1.8 s → 0.76 s; identical order resolution on all 7,050 PACK rows |
| `orders-list.ts`: `pl_latest` / `pack_activity` / `next_pack_activity` / `pack_duration` whole-table CTEs (no organization filter) → org-scoped per-order laterals; dead `sal_scan` deleted; `rr_ranked` CTE → `rol_order_idx` lateral | full list 2.58 s → 0.98 s; To-ship queue 0.72 s → 0.55 s; pack/replenishment/tracking fields identical on all 439 rows |
| `shipment_links` / sibling-order lookups in the tracking lateral gained `organization_id` (index use + tenant scope) | 1.15 s of seq scans removed |
| Desk scan / FNSKU scan write `metadata.source` `picking.desk.scan` / `fba.fnsku-scan` with their own rate-limit buckets | was shared `tech.scan` / `tech-scan` |

Measured, not worth it: `pick_scan` OR → UNION ALL (132 ms → 117 ms over every order).
Next: an `order_stage_facts` table written by the pick/pack/QC writers, replacing the per-order
stage laterals and the `sqlOrderHasPickScan` / `sqlOrderHasPackScan` EXISTS in `queue-counts.ts`.
