# EXECUTION PROMPT — Fable 5 · All-Tables Improvements (grid plan Phase E + table-family completion)

> Paste everything below the line into a fresh **Fable 5** session at the repo
> root (`/Users/icecube/repos/cycleforge-app`). Model: **`claude-fable-5-thinking-high`**
> (or the user's Fable 5 alias).
>
> **Plan SoT:** [`docs/todo/grid-surface-descriptor-plan.md`](./grid-surface-descriptor-plan.md)
> (+ run record [`grid-surface-descriptor-phase-a-RUN-NOTES.md`](./grid-surface-descriptor-phase-a-RUN-NOTES.md)).
> If this prompt conflicts with the plan, **the plan wins** (unless the human
> overrides in chat).
>
> **Gate grants:** pasting this prompt IS the human GO for **Phase E (TanStack
> grouping on day-band surfaces)** and for the **descriptor-driven Fields /
> visibility work (plan §7.3)** — both previously ask-first. Everything in
> § Still ask-first stays gated.

---

# Cycle Forge — All-Tables Improvements (Fable 5)

You are Claude Code (**Fable 5**) in the Cycle Forge monorepo (`cycleforge-app`).

## Mission (one line)

Finish the table story the grid-surface-descriptor initiative started: fix the
red table-adjacent e2e, push station grid sorts into the URL, execute **Phase E**
(TanStack grouping behind the day-band surfaces), generate the Fields/visibility
menu from descriptors, tokenize high-traffic cells, and collapse the remaining
bespoke `<table>`s onto the right house family (`LedgerGrid` family vs
`DataTable`) — **upgrading Kinetic Ledger, never importing a foreign grid** —
with Playwright proof per wave.

## Read first (in this order, before writing)

1. **`docs/todo/grid-surface-descriptor-plan.md`** — status block (Phases A–D
   LANDED, E gated → granted by this prompt), §5 descriptor sketch, §7.2–7.4
   long-term evolution, § React Compiler trap.
2. **`docs/todo/grid-surface-descriptor-phase-a-RUN-NOTES.md`** — what already
   shipped + the per-row Playwright matrix; do not regress any PASS row.
3. **`AGENTS.md`** + **`CLAUDE.md`** — Kinetic Ledger, pattern evolution,
   verify law. `.claude/rules/ui-design-system.md` → the **Grid state math**
   bullet (headless waist law).
4. **`src/design-system/DESIGN_SYSTEM.md`** → *Workbench spreadsheet (SoT)*
   section — LedgerGrid split-x mode, `useGridSurface`, descriptors,
   `LedgerGridSurface`, grid-cells, DataTable boundary.
5. Key code (the shipped waist):
   - `src/design-system/components/grid/` — `LedgerGrid.tsx` (split-x),
     `useGridSurface.ts` (**keep `"use no memo"`**), `grid-surface-descriptor.ts`,
     `LedgerGridSurface.tsx`, `VirtualGroupedSections.tsx`
   - `src/components/ui/grid-cells.tsx` — shared VALUE cells
   - `src/components/dashboard/orders-queue/` — `OrdersGridView.tsx`,
     `orders-queue-column-defs.ts` (mode-defs template), `helpers.ts`
   - `src/components/station/incoming-grid/` + `receiving-grid/` — descriptor
     adopters (`*-descriptor.ts`, views)
   - `src/lib/tables/table-columns.ts` + `TableColumnConfig` — hide registry
   - `src/design-system/components/DataTable/DataTable.tsx` — the
     non-virtualized family (ONE adopter today: `FbaShipmentsTable`)
6. **Existing Playwright (keep green, extend):**
   `tests/e2e/pending-grid-tanstack-tested.spec.ts` (11) ·
   `to-ship-pending-grid.spec.ts` (9) · `orders-queue-skin-scoping.spec.ts` (3) ·
   `unshipped-virtual-list.spec.ts` (1) · `incoming-click-to-open.spec.ts` ·
   `receiving-tech-modes.spec.ts` · `dashboard-inbound-mode.spec.ts` ·
   `fba-shipment-trace.spec.ts` · `playwright.config.ts` (`desktop` project).

Also run: `pnpm worklog:tail` (last ~10) before starting.

## Locked decisions (already made — do not relitigate)

1. **Engine stays hybrid B-.** TanStack Table v8 = state math only
   (`useGridSurface`, `"use no memo"`); Kinetic Ledger owns markup, geometry
   (house CSS-var templates), fetch, mutations. Never AG Grid / MUI / Glide /
   shadcn table / react-data-grid; never a second width system.
2. **Two families, one law.** Virtualized ops queues → `LedgerGrid` family
   (`LedgerGridSurface` + `GridSurfaceDescriptor` for station-shape surfaces);
   non-virtualized lifecycle/admin tables → `DataTable`. Hand-rolled `<table>`
   for an ops surface is a fork — migrate it; **grow** the family primitive when
   it is missing a genuine capability (row actions slot, footer, density) rather
   than keeping the fork.
3. **Descriptors are the mode waist.** New mode/column layout = new descriptor /
   TanStack defs (`buildLedgerColumnDefs`), never a parallel sticky-header
   table. The TESTED lane (`fulfillment.tested`) is the template.
4. **URL is the durable state SoT** for filters/sort on Workbench tables
   (`.claude/rules/display/workbench.md`). Station grid sorts reuse the
   `?sort=` / `?dir=` vocabulary pattern (mode-scoped: switching mode clears
   them). Ephemeral-only state (viewport force-hide) stays out of the URL.
5. **Visibility prefs stay in `staff_preferences.tableColumns[tableId]`** —
   extend the existing JSON shape (`hidden` keys / `order`) only; **no DB
   migration**. TanStack `columnVisibility` becomes the runtime chokepoint
   (staff hides + viewport force-hide merged); descriptor is the SoT for which
   columns are hideable (`hideKey`).
6. **Phase E constraints (grant included):** TanStack grouping may own the
   day-bucket **state/model** on `StationListTable`, `FbaBoardTable`,
   `RepairTable` (+ `PackerTable`/`TechTable` if trivially same-shaped), but
   `VirtualGroupedSections` + `DateGroupHeader` keep the DOM — grouped row
   model feeds the existing `daySections` / `orderGroupsByDate` shapes through
   an adapter. If virtualizer indices / sticky day pins misalign in testing,
   **bail out**: keep house grouping on that surface, record why in the plan,
   move on. No layout/DOM change is acceptable collateral.
7. **Cell tokens (plan §7.2):** add optional `cellType` to the descriptor
   column model dispatching into `@/components/ui/grid-cells` (+ CopyChip
   family); row registries become thin routers for tokenized columns; bespoke
   cells (title/editors/indicators) stay `custom` render cases. No visual diff.
8. **Closed forever (still):** Excel range-select / fill handle; reviving
   Pending drag-resize / density / TableOptions ⋯; schema auto-CRUD from
   Drizzle; per-surface search engines. TanStack v9 only if verifiably stable
   AND React-Compiler-safe at impl time — otherwise keep v8 + `"use no memo"`
   (the guard test must keep passing either way).
9. **Proof = Playwright per wave.** Manual spot-checks alone are not done.

## Hard rules

- Obey `AGENTS.md` SoTs: dates, condition, platform, status chips, z-index,
  focusRing, spacing intents, toasts. No page-local hex / status→class maps.
- **Do not commit or stash.** Leave unrelated working-tree changes untouched;
  the user manages commits. Stay on the current checkout branch.
- **`npm run verify` green before done** — never raise DS-ratchet baselines;
  never `--no-verify`.
- Keep the shipped 24-test grid suite green after every wave.
- Append `pnpm worklog "…" --result …` per landed wave; update the plan status
  block as waves land.
- Stable selectors for anything new: `data-col="…"`, `data-testid="…-body"` /
  `…-scroll` (derived pair convention).

## Order of work

### W0 — Ground + fix the red table-adjacent e2e

- Read-only ground: confirm plan status, run the grid suite once
  (`npx playwright test tests/e2e/to-ship-pending-grid.spec.ts
  tests/e2e/orders-queue-skin-scoping.spec.ts
  tests/e2e/pending-grid-tanstack-tested.spec.ts
  tests/e2e/unshipped-virtual-list.spec.ts --project=desktop`) — expect 24 green.
- Fix the three pre-existing reds (chrome drift, NOT grid regressions):
  - `dashboard-inbound-mode.spec.ts` (2) — `/dashboard?mode=inbound` now
    renders the Triage/Unbox workspace, not the old Unboxed·Scanned History
    facets. Decide truth (likely: update the spec to the current inbound
    composition; check `docs/todo/*dashboard*` handoffs + git log first).
  - `receiving-tech-modes.spec.ts:241` — TestingPanel opens fine; the
    `carton-context-classify-pills` testid / toolbar names drifted. Re-anchor
    the spec to the current `@/components/station/entity-context` chrome (or
    restore the testid if it was dropped accidentally).
- Exit: full station+dashboard table spec set green.

### W1 — Station grid sorts into the URL

- `IncomingGridView` + `ReceivingGridView` column sort currently lives in
  `useState` (ephemeral). Mirror it to URL params with mode-scoped clearing,
  reusing the `useQueueDisplaySort` pattern (generalize that hook or add a thin
  sibling — do NOT fork a third sort-param vocabulary; `?sort=`/`?dir=` on
  `/incoming`; on multi-mode receiving/testing routes clear on mode switch like
  `useReceivingMode` does for its params).
- TanStack stays the toggle chokepoint (`LedgerGridSurface.onSortChange` now
  writes the URL instead of local state).
- Playwright: extend an incoming/receiving spec — header click → URL param →
  reload restores sort → mode switch clears it.

### W2 — Phase E: TanStack grouping behind day-band surfaces (GRANTED)

- Per locked decision 6. Suggested shape: a `useGridSurfaceGrouping` extension
  (or option on `useGridSurface`) enabling `getGroupedRowModel` +
  `getExpandedRowModel` with `manualSorting` intact; group key = the existing
  day key (`toPSTDateKey` of the surface's date source). Adapter:
  `groupedRowModel → [dayKey, rows][]` handed to the UNCHANGED
  `VirtualGroupedSections` props on `StationListTable`, `FbaBoardTable`,
  `RepairTable`.
- Prove equivalence: unit test that the adapter output is deep-equal to the
  current house day-bucketing for representative fixtures (order preserved,
  empty days, single-day).
- Playwright: day bands still render + pin (extend `fba-shipment-trace` /
  station list coverage or add `tests/e2e/day-band-grouping.spec.ts` with a
  mocked feed): band headers visible, counts right, sticky pin under scroll,
  virtualization still windowed.
- Bail-out clause active (decision 6). Update plan Phase E status either way.

### W3 — Descriptor-driven Fields / visibility menu (GRANTED)

- Descriptor (`hideKey` on column models) becomes the SoT for hideable columns;
  merge runtime staff hides (`TableColumnConfig` / `useIsColumnHidden`) into
  TanStack `columnVisibility` on grid surfaces (Pending merges force-hide +
  staff hides; today staff-hidden columns render empty ruled cells — decide ONE
  behavior per surface and keep header/body/summary consistent; removing the
  track entirely like force-hide is preferred if geometry tests stay green).
- Add a quiet Fields menu (workbench sort-chrome styling laws: trailing, quiet,
  never a solid TabSwitch) generated from the descriptor for Pending +
  Incoming + Receiving. Persist as delta in
  `staff_preferences.tableColumns[tableId].hidden` (existing shape).
- Playwright: toggle a column off → track disappears everywhere (header/body/
  summary) → persists across reload → restore works; locked `select·title`
  never hideable.

### W4 — Cell-token registry (plan §7.2)

- Add optional `cellType` to `LedgerGridColumnModel`
  (`'dash' | 'date' | 'age' | 'platformMark' | 'staff' | 'dateTime' | 'qty' |
  'conditionTone' | 'orderChip' | 'trackingChip' | 'serialChip' | 'custom'`…
  grow from real usage, not speculation) + a dispatch helper beside
  `grid-cells.tsx`. Migrate the tokenizable columns of the Pending / Incoming /
  Receiving row + summary registries to the dispatcher; bespoke cells stay
  explicit `custom` cases. **Zero visual diff** — the existing specs are the
  regression harness.

### W5 — Collapse bespoke `<table>`s onto the right family

Survey ground truth (2026-07-23): `DataTable` has ONE adopter
(`FbaShipmentsTable`); these hand-rolled `<table>`s remain. Migrate in this
order, choosing family by data shape (`.claude/rules/contextual-display.md`):

| Surface | File | Target |
|---|---|---|
| Ready-to-pack allocation queue | `src/components/outbound/ready/ReadyQueueTable.tsx` (237) | `DataTable` (grow: row-link cells) |
| Unfound queue | `src/components/receiving/unfound/UnfoundQueueTable.tsx` (+ `queue-table/`) | `DataTable` — KEEP its debounced inline-PATCH cell waist |
| Tracking exceptions | `src/components/tracking-exceptions/TrackingExceptionsTable.tsx` (511) | `DataTable` (or LedgerGrid if virtualization proves needed) |
| Warranty claims | `src/components/warranty/WarrantyClaimsTable.tsx` (113) | `DataTable` |
| Bins | `src/components/warehouse/BinsTable.tsx` (213) | `DataTable` |
| Inventory by-unit | `src/components/inventory/ByUnitView.tsx` (382) | `DataTable` |
| Staff admin | `src/app/settings/staff/StaffTable.tsx` (393) | `DataTable` |
| Settings audit / AI / sessions / kiosk devices | `src/app/settings/audit/page.tsx`, `settings/ai/page.tsx`, `SessionsSection.tsx`, `KioskDevicesSection.tsx` | `DataTable` (batch) |
| Admin inventory + sourcing compat | `admin/inventory/*`, `CompatibilityManagementTab.tsx` | `DataTable` (batch) |
| PO-mailbox scanned mode | `src/components/po-gmail/mailbox/ScannedMode.tsx` | `DataTable` if it's a real table; skip if layout-only |

- Grow `DataTable` ONCE for what the batch needs (candidates: row action slot,
  `onRowHref`, footer row, density variant, empty-state slot pass-through) —
  then compose. Do not add TanStack to `DataTable` (its simplicity is its job).
- Dialog/markdown `<table>`s (`OrderSyncDialog`, `MarkdownRenderer`,
  `LocationSelector`, `InventoryFulfillmentSyncDialog`) are OUT of scope.
- Playwright: one smoke per migrated ops surface (mounts, sorts if sortable,
  key action still works) — batch the settings/admin ones into a single spec.
- This wave is large: land it table-by-table (each leaves verify + suites
  green); stop at the wave boundary if context runs short and record progress
  in the plan status.

### W6 — Engine hygiene (close-out)

- Evaluate TanStack **v9**: only adopt if a stable release verifiably fixes the
  React Compiler interaction; otherwise record "stay v8" with the checked
  version in the plan. Either way `orders-queue-column-defs.test.ts`'s
  `"use no memo"` guard must keep passing (or be replaced by an equivalent
  compiler-safety guard if v9 retires the directive).
- Update plan status to a final state; `pnpm worklog` per wave landed; refresh
  `DESIGN_SYSTEM.md` + `.claude/rules/ui-design-system.md` grid bullets if the
  family grew.

### Still ask-first (NOT granted by this prompt)

- Descriptor-owned React Query hydration (plan §7.4) — fetch stays with hosts.
- Excel range-select / fill handle.
- Any DB migration (incl. new prefs tables), search-engine, or status-machine
  work.
- Public API BREAKS to `LedgerGrid` / `DataTable` (additive props are fine).

## Done means

- W0 reds fixed; the full table-related desktop spec set green, including the
  original 24 grid tests.
- Station sorts URL-durable (reload-safe, mode-scoped).
- Phase E grouping landed behind unchanged day-band DOM (or a recorded bail-out
  per surface with reasons) — plan Phase E status closed either way.
- Fields menu descriptor-generated on the three grid surfaces; prefs persist as
  delta; locked pane never hideable.
- Tokenized cells dispatching through `grid-cells` with zero visual diff.
- W5 tables migrated (or an explicit recorded stop-point at a table boundary).
- **`npm run verify` green**; screenshots for new surfaces under
  `test-results/`; worklog entries per wave; plan status current.
