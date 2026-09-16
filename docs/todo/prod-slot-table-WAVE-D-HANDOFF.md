# HANDOFF — Wave D: the second-engine port is DONE

**Lane:** `~/Projects/cycleforge-lanes/prod` (detached, port 3077). Never start a
dev server, never touch `:3050`, never create a branch.
**Parent handoff:** `docs/todo/prod-slot-table-SOT-HANDOFF.md` (waves A–C).
**Constitution:** `src/lib/tables/table-engine-law.ts`.

**`ADMIN_TABLE_DEBT` is EMPTY.** Every settings and admin-SKU-ops desk that
painted the second table engine now mounts the one slot `DataTable` as a
registered family. Exactly one surface still imports `AdminTable`, and it is the
`ADMIN_TABLE_ALLOW` ruling, not debt.

Tree state at completion (2026-09-12):

| Check | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | clean |
| `src/lib/tables/**` + `src/components/tables/**` suites | **858 / 858** |
| law · catalog · cohort · discover · definition · search-guard | **71 / 71** |
| `table-record-plane.guard.test.ts` | 47 / 47 |
| `pnpm run eval:cohort slot-table` | `ok: true`, **44 peers, 44 enginePeers**, `discoverDelete: 0` |
| `grep -rl "from '@/design-system/components/AdminTable'" src` | `src/app/settings/ai/page.tsx` — the ALLOW entry, and nothing else |

Cohort peers went 32 → 44. `REGISTERED_BINDINGS` is 44 bindings / 44 unique
tableIds and matches `PRODUCT_TABLES` exactly.

---

## What Wave D landed

### Batch 1–2 (already recorded before this session)

`auth-sessions`, `cycle-counts`, `admin-returns`, the two REUSE slices of
`/admin/inventory/sku/[sku]` (units → `inventory-units`, events →
`inventory-events`), `part-compatibility`, `audit-log`, `unit-allocations`,
`unit-tsn-links`; `FlagsSection` → `<dl>`; throughput by-actor → KPI tiles.
Rulings applied: throughput heatmap → `HAND_HTML_TABLE_ALLOW`; `/settings/ai` →
the new `ADMIN_TABLE_ALLOW`.

### Batch 3 — the final eight desks (this session)

Twelve new `TableId`s, **eleven** new entity families (the twelfth id is a
sibling DOCUMENT over an existing family), zero new `*GridHost`, zero new
`*GridRow`, and no family cell.

| Desk | Families | Notes |
|---|---|---|
| `/admin/inventory/sku/[sku]` (last 3 mounts) | `sku-bins`, `sku-ledger`, `sku-allocations` | Allocations REUSE the `unit-allocations` catalog by reference — `entityFamily`/`cellMapKey` stay `unit-allocations`. The retired `refs` cell that packed three reference ids into one string is three facts now. |
| `/admin/inventory/holds` | `admin-holds` | Release is a row verb → `HoldReleasePlane` (`DeskStageOverlay`) carrying the restore-status override. Raw green `ds-raw-button` gone. |
| `/admin/inventory/bulk-allocate` | `admin-bulk-allocate` | `allocateOne` stays a server action handed to the island as a prop, so the `orders.view` gate and `revalidatePath` still run server-side. `qty`/`eligible` are derived in the resolver with NO catalog `paths`. |
| `_inventory-admin/TableSections.tsx` | `admin-drift-alerts`, `admin-sku-drift` | Recent events REUSE `inventory-events`. `AllocationsSection` became a KPI tile band — a `GROUP BY state` row is not an entity. The clean-drift prose is now the table's empty STATE, not a branch that swaps the table out. |
| `/reports` | `report-bin-utilization`, `report-velocity`, `report-dead-stock` | `ReportRow = Record<string, unknown>` is gone: three real row types in `src/lib/reports/report-rows.ts`, zod-narrowed at the `fetch` boundary. Fixed two live bugs on the way — `NaN` days-dormant for never-moved rows, and `?? 0` claiming zero stock for a SKU with no `sku_stock` row. |
| `/settings/staff` | `staff-directory` | The two-control inline `auth` editor became ONE verb → `StaffAuthPolicyPlane` submitting ONE payload (the old cell fired two POSTs that raced their own refetches). `STEP_UP_REQUIRED` → toast survives, extracted as a tested seam. Deactivate is a danger verb behind `StaffDeactivatePlane`; `confirm()` gone. |
| `/admin/inventory/cycle-counts/[id]` | `cycle-count-lines` | The inline Counted `<input>` became a Count verb → `CycleCountLinePlane`. The polymorphic Action track is split: verbs to the row menu, provenance to real PERSON facts. `variance_tol` reaches the adapter through the ROW, never as page state. |
| Incoming returns staging host | **none — by design** | See below. |

### Cross-desk rulings applied (state them to any future porter)

1. **A write whose payload needs a parameter is a verb that OPENS A PLANE.** No
   family in this repo sets `capabilities.inCellEdit: true`; there is no in-cell
   editor on a compound row, and minting one is an engine change. Holds' restore
   `<select>`, the cycle-count numeric input and Staff's two-control auth editor
   all became Center-Lock L2 `DeskStageOverlay` planes reached by a row verb.
2. **Skeleton mounts WHOLE, chrome gets relabelled.** No new
   `COMPOUND_SKELETON_FILTER_DEBT` row was added by any of the eight desks.
3. **A factless chrome track is declared inert, never cut and never faked.**
   Two desks have no timestamp at all (`admin-sku-drift` over
   `v_sku_stock_drift`, `report-bin-utilization` over `mv_bin_utilization`):
   both mount the `dates` track with `gridLabel: ''` + `sortable: false` and a
   null adapter face. Neither invented a stamp; neither grew the filter debt.
   Contrast `admin-bulk-allocate`, which had a real fact available and selected
   `order_date`/`created_at` rather than paint a dead track.
4. **Tone is never the fact.** Every retired colour rule (tri-colour
   availability, signed-red drift, rose/emerald velocity, `!active` dimming)
   became a WORD in the state pill or a real bindable fact. Losses are named
   per-desk in the agents' reports; the loudest is Staff's five-cell dim wash,
   replaced by an `Account` fact that — unlike a dim — sorts, searches and binds.

---

## Still open (none of it is a desk port)

1. **The incoming returns staging host.** `CsvImportStagingHost` is **hard-wired
   to orders-import** (`ORDER_IMPORT_DESCRIPTOR`, `CSV_IMPORT_STAGING_TABLE_BINDING`,
   `useOrdersImportTableLayout`, `csvImportStagingSheetColumnsFor`,
   `CsvImportStagingGridRow`, `CsvImportStagingRail`, plus a local
   `compareStagingRows` switching on `orders-import.*` fact-id literals). Per the
   operator ruling, generalising it is an ENGINE change, so this wave produced a
   plan and no code: **`docs/todo/csv-import-staging-generalisation-PLAN.md`** —
   proof of the hard-wiring, a current-vs-proposed type table, the descriptor gap
   analysis, a bit-for-bit behaviour table mapped to the tests that assert each
   hook, the one-vs-two-layout-document argument (it recommends TWO), and five
   named operator rulings that must land before any code. Its
   `HAND_HTML_TABLE_DEBT` row deliberately STAYS: the list is shrink-only and an
   id leaves when the surface mounts a family, not when a plan exists. Note the
   tripwire also asserts each debt file still paints a `<table>`, so the file
   delete and the row removal must be one commit.
2. **A stale e2e assertion, found while writing that plan — needs an operator
   ruling.** `tests/e2e/csv-import-staging.spec.ts:101-110` (and `:169-171`)
   asserts `edit order number for staging row 3` on a button AND a textbox. **No
   source file renders that accessible name.** The orders staging grid declares
   `inCellEdit: false` and its only labelled row control is `Select staging row N`;
   the only place rendering `… for staging row N` is the RETURNS hand table. The
   golden surface lost its in-cell corrector in the Wave-1.4 slot port and its
   spec was never updated. Left untouched on purpose: re-adding or retiring
   in-cell correction on a live desk is a behaviour decision, not a porter's.
3. **`AdminTable.tsx` cannot be deleted yet, and that is now a one-line
   decision.** `ADMIN_TABLE_DEBT` is empty, so the only thing keeping the wrapper
   alive is `ADMIN_TABLE_ALLOW` → `/settings/ai`, whose rows are
   `GROUP BY (context, provider, model)` buckets with a composite key. Closing it
   out needs either a real per-call entity for AI usage to list, or an operator
   decision to accept the wrapper permanently. Before deleting the directory,
   check `TableStickyXScroll`'s callers.
4. `src/app/settings/audit/page.tsx`'s filter is still an HTML GET `<form>`;
   folding it into the DataTable filter menu is a named follow-up.
5. `StationListTable` survives ONLY as `StationPipelineBoard`'s lane body (a
   swimlane board behind `STATION_PIPELINE_BOARDS`, shared with Receiving and
   Testing history). Not a table fork; porting board lanes is its own unit.
6. **Merge collision, unchanged.** The non-lane repo `~/Projects/cycleforge-app`
   contains a DIFFERENT port of the compatibility desk — family `compatibility`,
   verb declared inline on the page (violates `VERBS_BIND_TO_FIELDS`), no confirm
   plane, `is_oem` still merged into `fit`. The lane version
   (`part-compatibility`) is the one ruled to survive. Operator decides the merge.
   Verified this session: no Wave D file leaked into that checkout.

## Out-of-wave cleanup done here, so it is not a surprise in the diff

Three tests were failing at `HEAD` before this session — proven pre-existing:
`compound-columns.ts`, `materialize-tracks.ts`, `tracking-exceptions-resolve.ts`
and all three test files are byte-identical to `HEAD`. They pinned superseded
contracts, so they were corrected rather than left red:

- `receiving.test.ts` / `incoming.test.ts` hard-typed a pre-`dates` track order
  that still listed the retired `amount` and `actions` tracks. Both now DERIVE
  the expectation from `COMPOUND_COLUMN_KEYS` and assert the real contract —
  a bound fact opens a status track after the state pill and before the `_fill`
  slack — so they cannot go stale the next time the skeleton gains chrome.
- `tracking-exceptions.test.ts` expected `kind: 'value'` from
  `tracking-exceptions.staff`, whose catalog entry is `displayType: 'person'`.
  Now asserts the `{ kind: 'person', staffId, name }` shape.

## Verify

```bash
cd ~/Projects/cycleforge-lanes/prod
npx tsc -p tsconfig.json --noEmit
node --import tsx --test src/lib/tables/**/*.test.ts src/components/tables/**/*.test.ts
pnpm run eval:cohort slot-table    # ok: true, 44 peers, discoverDelete 0
```

**Not verified by any of the above — and it is the operator's, by lane law.**
Nothing has been looked at in a browser. Agents never start a lane server, and
`pnpm lane verify prod` is the only thing that declares a feature done. The
twelve new mounts need eyes (`pnpm lane up prod`):

`/admin/inventory/sku/<sku>` (bins · allocations · ledger — three new islands) ·
`/admin/inventory/holds` (+ the release plane) · `/admin/inventory/bulk-allocate`
(+ allocate a real candidate and confirm the row leaves) · `/admin/inventory`
(two drift tables, the allocation KPI band, recent events) · `/reports` (all
three tabs) · `/settings/staff` (+ both planes, and a `STEP_UP_REQUIRED` path) ·
`/admin/inventory/cycle-counts/<id>` (+ the count plane, Approve, Reject).
Regression sweep for the desks landed earlier: `/settings/sessions`,
`/admin/inventory/cycle-counts`, `/admin/inventory/returns`,
`/admin/inventory/throughput`, `/settings/audit`, `/admin?section=compatibility`,
`/inventory?unit=<id>`, plus `/test` and `/pack` for the Wave C benches.
