# EXECUTION PROMPT — Fable 5 · Grid Surface Descriptor (Pending slice 1)

> Paste everything below the line into a fresh **Fable 5** session at the repo root
> (`/Users/icecube/repos/cycleforge-app`). Model: **`claude-fable-5-thinking-high`**
> (or the user's Fable 5 alias).
>
> **Plan SoT:** [`docs/todo/grid-surface-descriptor-plan.md`](./grid-surface-descriptor-plan.md)
> — if this prompt conflicts with the plan, **the plan wins** (unless the human
> overrides in chat).

---

# Cycle Forge — Kinetic Ledger Grid Surface (Fable 5)

You are Claude Code (**Fable 5**) in the Cycle Forge monorepo (`cycleforge-app`).

## Mission (one line)

Execute **Phase A** of
[`docs/todo/grid-surface-descriptor-plan.md`](./grid-surface-descriptor-plan.md):
install **TanStack Table v8 headless** on **Pending only**, author mode column
sets (incl. `ustatus=TESTED` → **Tester** + **Tested at**) as TanStack
`ColumnDef`s, keep `LedgerGrid` + Kinetic Ledger cells + house order-folds —
**upgrade Kinetic Ledger**, do not replace it — then **prove every feature
works with Playwright** (expansive matrix below). Manual spot-checks alone are
**not** done.

Do not reopen AG Grid / shadcn / MUI / Glide / MegaTable succession.

---

## Read first (in this order, before writing)

1. **`docs/todo/grid-surface-descriptor-plan.md`** — **SoT for this run.**
   Memorize: hybrid **B-**, sequencing validation, React Compiler trap, Phase A
   checklist, §9 field contract (`tester_name` / `test_activity_at`), Final verdict.
2. **`AGENTS.md`** + **`CLAUDE.md`** — Kinetic Ledger + pattern evolution + verify.
3. **`src/design-system/DESIGN_SYSTEM.md`** — `LedgerGrid` golden path.
4. **`.claude/rules/ui-design-system.md`** + **`contextual-display.md`** +
   **`display/workbench.md`**
5. Prior Pending art (do not regress):
   - `docs/todo/pending-grid-status-column-plan.md`
   - `docs/todo/pending-grid-minimal-simplify-handoff.md`
6. **Existing Playwright (extend, do not orphan):**
   - `tests/e2e/to-ship-pending-grid.spec.ts`
   - `tests/e2e/orders-queue-skin-scoping.spec.ts`
   - `tests/e2e/unshipped-virtual-list.spec.ts` (virtualization smoke)
   - `playwright.config.ts` (`desktop` project + `tests/.auth/admin.json`)
7. Key code:
   - `src/design-system/components/grid/LedgerGrid.tsx`
   - `src/design-system/components/grid/VirtualGroupedSections.tsx`
   - `src/lib/dashboard-order-row-layout.ts` (`ORDERS_QUEUE_COLUMNS`, template, frozen)
   - `src/components/dashboard/orders-queue/OrdersGridView.tsx`
   - `OrdersQueueColumnHeader.tsx` / `OrdersQueueTableRow.tsx` / `QueueGroupRow.tsx`
   - `src/components/dashboard/orders-queue/cell-editors.tsx`
   - `src/app/api/orders/route.ts` (Pending row projection)
   - `src/types/orders.ts` / `src/utils/date.ts` (`formatDateTimePST`)
   - `src/lib/tables/table-columns.ts` + `TableColumnConfig`
   - `src/components/unshipped/useToShipStatusFilter.ts`

Also run: `pnpm worklog:tail` (last ~10) before starting.

---

## Locked decisions (already made — do not relitigate)

1. **Product framing:** upgrade **Kinetic Ledger**. Headless TanStack = state
   math only. Zero foreign UI grid aesthetic.
2. **Engine = hybrid B-:** `@tanstack/react-table` (v8 default) + keep
   `LedgerGrid` + `@tanstack/react-virtual` + house cells / editors / mutations.
3. **Phase A scope = Pending only** (`OrdersGridView` / `/dashboard?unshipped`
   and siblings that share that composer). **No** Incoming / Receiving /
   day-band TanStack grouping in this run.
4. **TanStack owns:** column defs + sorting + visibility (column order if it
   drops in cleanly). **TanStack does NOT own:** markup, virtualization,
   grouping, range/fill, fetch, optimistic mutations.
5. **House keeps:** `ordersQueueGridTemplate` / `--cf-orders-grid-w` / frozen
   sticky offsets / viewport force-hide; `orderGroupsByDate` + `QueueGroupRow`
   order-folds; F2 / cell-editors; `useOrderAssignment` waist; URL `?sort=` /
   `?ustatus=` as durable SoT (TanStack mirrors).
6. **Author TESTED columns as TanStack `ColumnDef`s from day one** — no
   throwaway house-only `GridColumnDef` then rewrite.
7. **TESTED mode columns:** add **Tester** + **Tested at**; optionally demote
   redundant Status pill when every row is TESTED. Field contract = plan §9
   (`test_activity_at` primary on `/api/orders`; `formatDateTimePST`; name
   via `tested_by_name` → `tester_name` → `getStaffName` → `normalizePersonName`;
   ignore `'1'` sentinel).
8. **React Compiler trap:** put `"use no memo"` on `useGridSurface` (and any
   consumer that calls `table.getRowModel()` / `getHeaderGroups()` into render)
   even though `next.config.ts` does **not** enable `reactCompiler` today.
   Do not disable the compiler globally. Evaluate Table **v9** only if clearly
   stable at impl start; otherwise v8 + `"use no memo"`.
9. **Closed forever this run:** AG Grid, MUI X, Glide, Teable/NocoDB/Baserow,
   react-data-grid, schema auto-CRUD, Excel range-select / fill handle,
   reviving Pending drag-resize / density / TableOptions ⋯.
10. **Proof = Playwright.** Every feature in the matrix below must have an
    automated assertion (new or extended). Screenshots under `test-results/`
    for visual anchors. Unit tests alone + manual browser are insufficient.

---

## Hard rules

- Obey `AGENTS.md` SoTs: dates, condition, platform, status chips, z-index,
  focusRing, toasts. No page-local hex / status→class maps.
- **Do not commit or stash.** Leave unrelated working-tree changes untouched;
  user manages commits.
- Stay on the current checkout branch; do not create ad-hoc branches.
- **`npm run verify` green before done** — never raise DS-ratchet baselines;
  never `--no-verify`.
- **Playwright green** for the Phase A suite (commands below) before claiming
  done.
- Append `pnpm worklog "…" --result …` when a unit lands.
- Prefer growing existing primitives over parallel systems.
- Add stable selectors for new columns: `data-col="tester"` and
  `data-col="testedAt"` (or document the chosen keys in the spec + plan). Prefer
  existing `data-testid="pending-grid-body"` / `pending-grid-scroll` /
  `data-order-row-id` / `data-col="…"`.

---

## Order of work

### 0 — Ground (read-only)

- Confirm `package.json` has `@tanstack/react-virtual`, not yet
  `@tanstack/react-table`.
- Confirm Pending: `showDayHeaders` false; `orderGroupsByDate` + `renderGroup`
  for order-folds only; no `onResizeColumn` on `OrdersGridView`.
- Skim `/api/orders` for `tester_name`, `tested_by`, `test_activity_at`.
- Read existing e2e specs listed above; note what already covers chrome vs what
  Phase A must add.

### 1 — Install + waist

- Add `@tanstack/react-table` (v8 unless v9 verified stable).
- Create `useGridSurface` (or equivalent waist) wrapping `useReactTable` +
  `createColumnHelper`.
- File starts with **`"use no memo"`** (plan § React Compiler trap).
- Controlled state: columns, sorting (mirror `?sort=`), visibility (mirror
  staff prefs / force-hide as appropriate). No grouping model.

### 2 — Wire Pending composer

- Adapt `OrdersGridView` so column header / row / visibility / sort read from
  the TanStack table instance **without** changing `LedgerGrid` DOM contract.
- Keep geometry CSS vars + frozen pane + viewport force-hide as house logic.
- Keep `QueueGroupRow` / order-fold outside TanStack.
- Preserve F2 + `cell-editors.tsx` behavior.

### 3 — Mode column sets + TESTED

- Implement mode-keyed column defs (at minimum default fulfillment vs
  `ustatus=TESTED`).
- TESTED: **Tester** + **Tested at** cells per §9; unit-test column keys per
  mode (mirror `incoming-grid-layout.test.ts` style).
- Confirm dogfood / e2e fixtures can surface at least one TESTED row with
  `test_activity_at` + a name/id; if the live API omits fields, fix projection
  before empty columns ship.
- Emit `data-col` on new cells/headers for Playwright.

### 4 — Playwright (mandatory — expansive matrix)

**Goal:** ensure **all** Phase A features work — regressions of the existing
Pending spreadsheet **and** new TanStack / TESTED behavior. Extend
`tests/e2e/to-ship-pending-grid.spec.ts` and/or add
`tests/e2e/pending-grid-tanstack-tested.spec.ts`. Keep
`orders-queue-skin-scoping.spec.ts` green. Prefer `@playwright/test` +
`desktop` project (skip webkit like the existing Pending suite).

#### Commands (must pass before done)

```bash
# Unit + CI mirror (always)
npm run verify

# Pending spreadsheet — existing + your extensions
npx playwright test tests/e2e/to-ship-pending-grid.spec.ts --project=desktop

# Skin scoping (Pending vs Packed)
npx playwright test tests/e2e/orders-queue-skin-scoping.spec.ts --project=desktop

# New Phase A file if you split it out (name may vary; must exist and pass)
npx playwright test tests/e2e/pending-grid-tanstack-tested.spec.ts --project=desktop
```

If auth/storage state is missing, run whatever the repo uses to refresh
`tests/.auth/admin.json` (see `tests/e2e/global-setup`) — do not skip the suite.

Screenshots: write under `test-results/` for each major case (default lane,
TESTED lane, frozen h-scroll, sort change, fold expand).

#### Feature matrix — every row needs a Playwright assertion

Mark each **PASS** in the PR/handoff notes. If a row cannot run without seeded
data, seed via existing e2e helpers / API or document a hard skip with reason —
prefer seed over skip.

**A. Shell & chrome (no regression)**

| # | Feature | Assert |
|---|---|---|
| A1 | Grid mounts | `[data-testid="pending-grid-body"]` visible on `/dashboard?unshipped` |
| A2 | Scroll surface | `[data-testid="pending-grid-scroll"]` present; h-scroll possible when needed |
| A3 | Airtable skin | Pending keeps `data-grid-skin="airtable"` (or scoped equivalent) |
| A4 | No day bands | Zero `[data-grid-day-band]` |
| A5 | No retired columns | No `data-col="notes"` / `data-col="stock"` on default Pending |
| A6 | Sticky header | Column header remains visible while scrolling body (page or scroll parent) |
| A7 | Queue sort chrome | `[data-queue-sort-switch]` visible |
| A8 | Packed skin isolation | Packed / other outbound mode does **not** leak Pending-only TESTED columns or break skin scoping (`orders-queue-skin-scoping.spec.ts`) |

**B. Default fulfillment columns (geometry & alignment)**

| # | Feature | Assert |
|---|---|---|
| B1 | Canonical headers | Headers for `title`, `date`, `age`, `status`, `qty`, `condition`, `platform`, `order`, `tracking` (glyph and/or accessible name; no truncated `A…`) |
| B2 | Header↔body lock | Left edges of platform/order/tracking header align with body cells (±4px) |
| B3 | Column rules | Interior cells have vertical rule; last tracking column does not |
| B4 | Status column | Every visible row has `data-col="status"`; pills read Pending / Tested / Out of stock vocabulary |
| B5 | Empty-tracking filter | No `[data-add-label]` / empty-tracking affordance on Pending rows |
| B6 | Platform marks | Platform cell is fixed brand mark / lettermark — not wide marketplace text |

**C. Frozen pane & selection**

| # | Feature | Assert |
|---|---|---|
| C1 | Frozen identity | After h-scroll, `select` + `title` stay pinned (`data-frozen-edge` / sticky left) |
| C2 | Select gutter | Checkbox / select-all still toggles row selection |
| C3 | Row open | Clicking product / row opens detail / selection behavior unchanged |
| C4 | No row drag grips | Grid skin: no `.cursor-grab` on body rows |

**D. Sort (URL SoT ↔ TanStack mirror)**

| # | Feature | Assert |
|---|---|---|
| D1 | Composite sorts | `QueueSortSwitch` Priority / Newest / Deadline updates `?sort=` and reorders rows |
| D2 | Column header sort | Clicking a sortable header updates `?sort=` (and dir when applicable) |
| D3 | Reload durability | Reload with `?sort=…` restores the same sort |
| D4 | Flat column-sort band | Under column sort, still no day-band headers; rows remain coherent |

**E. Order-fold groups (house, outside TanStack)**

| # | Feature | Assert |
|---|---|---|
| E1 | Singleton | Single-line orders render as plain rows |
| E2 | Multi-line fold | Multi-product same `order_id` shows group summary / disclosure |
| E3 | Expand / collapse | Expanding reveals child rows; zebra / stripe does not break |
| E4 | Columns track fold | Group summary uses same column tracks as leaf rows |

**F. In-cell edit & keyboard (must survive TanStack wiring)**

| # | Feature | Assert |
|---|---|---|
| F1 | Qty edit | Sheets-style qty edit commits (existing assign waist) |
| F2 | F2 / Enter | F2 or Enter starts edit on an editable cell without stealing focus incorrectly |
| F3 | Esc revert | Esc cancels draft |
| F4 | Blur / Tab commit | Blur or Tab commits; draft not silently dropped |
| F5 | Condition pill | Condition chip opens listbox; selecting a grade persists |
| F6 | Corner indicators | Note / OOS corner indicators still hover + open editors (if present on fixture row) |

**G. `ustatus` filters & mode column swap (Phase A core)**

| # | Feature | Assert |
|---|---|---|
| G1 | Filter PENDING | `?ustatus=PENDING` — only pending-stage rows (or empty state); default columns |
| G2 | Filter TESTED | `?ustatus=TESTED` — grid mounts; **Tester** + **Tested at** headers/cells present (`data-col="tester"`, `data-col="testedAt"`) |
| G3 | Filter BLOCKED | `?ustatus=BLOCKED` — blocked / OOS vocabulary; no crash |
| G4 | Clear filter | Removing `ustatus` restores default fulfillment column set |
| G5 | KPI / strip sync | Clicking Pending/Tested/Blocked chrome (if present) updates URL + column set |
| G6 | TESTED tester cell | At least one row shows a non-placeholder staff name (or `---` only when truly missing — assert format rules) |
| G7 | TESTED tested-at cell | Timestamp via `formatDateTimePST` shape (not raw ISO / not `'1'`); empty → em dash |
| G8 | Status demotion | If Status pill demoted on TESTED-only view, assert absence or quiet treatment; default view still has Status |
| G9 | Mode switch no freeze | Toggle PENDING → TESTED → PENDING; rows/headers update (guards React Compiler / stale TanStack memo) |
| G10 | Sort under TESTED | Column sort / age sort still works with TESTED column set |

**H. Visibility / force-hide / prefs**

| # | Feature | Assert |
|---|---|---|
| H1 | Viewport force-hide | Narrow viewport hides By → Qty → Ch. ephemerally; Age/Cond/Order/Tracking stay (or current house collapse order) |
| H2 | Widen restore | Widening restores collapsed columns without reload |
| H3 | Staff hide (if wired) | Toggling a hideable column via prefs/menu (if Phase A still exposes it) updates visibility; TanStack state matches |
| H4 | Column reorder (if still enabled) | Drag header reorder persists; `select`·`title` stay locked left |

**I. Virtualization & performance smoke**

| # | Feature | Assert |
|---|---|---|
| I1 | Virtual window | Scrolling large list does not mount all rows (reuse / extend `unshipped-virtual-list` ideas if feasible) |
| I2 | Scroll position | After scroll + ustatus toggle, grid remains usable (no blank sticky header / zero-height body) |
| I3 | Ancestor page scroll | Under `DashboardScrollShell`, KPI can scroll away; column header sticks under chrome |

**J. Negative / closed-option guards**

| # | Feature | Assert |
|---|---|---|
| J1 | No AG Grid / MUI DOM | No `ag-root`, MUI DataGrid classnames in Pending DOM |
| J2 | No day-band revival | Still zero day bands after TanStack adopt |
| J3 | No drag-resize revival | No resize handles on Pending headers unless explicitly re-approved |
| J4 | `"use no memo"` present | Grep/static assert in unit or e2e setup that the waist file contains the directive |

#### Playwright implementation notes

- Prefer **desktop** project; skip webkit for this suite (match existing Pending).
- Use `data-col` / `data-testid` — not brittle CSS class chains.
- For TESTED data: seed via API/fixture if org-01 is empty; do not mark G2–G7
  pass without a real or seeded TESTED row.
- Keep tests independent where possible; URL is the SoT (`unshipped`, `ustatus`,
  `sort`).
- Update any assertions that assumed a single fixed column list once TESTED
  columns exist.

### 5 — Close the unit

- `npm run verify` green
- All Playwright commands in §4 green; matrix rows marked PASS
- Update plan status line if Phase A landed (keep B–E deferred)
- `pnpm worklog "Pending Phase A: TanStack + TESTED columns + Playwright matrix" --result …`
- Stop. **Do not** start Phase B–E unless the human asks.

### APPROVAL GATE (only if blocked)

If wiring would require a **public** `LedgerGrid` API change, a staff-prefs
schema migration, or TanStack **grouping**, **stop and ask** before coding.
Otherwise execute Phase A without a mid-run approval pause.

---

## Out of scope (this session)

- Phase B cell-token registry across Incoming / Receiving
- Phase C `LedgerGridSurface` generalization beyond Pending
- Phase D `DataTable` boards
- Phase E day-band / TanStack grouped row model
- Descriptor-owned React Query fetch ownership
- Excel range selection / fill handle
- Installing AG Grid / shadcn as a design-system succession

---

## Done means

- Phase A checklist in the plan is complete
- `"use no memo"` present on the grid waist
- TESTED queue shows staff + tested datetime; PENDING/BLOCKED unbroken
- `LedgerGrid` markup + Kinetic Ledger cells + house order-folds intact
- **`npm run verify` green**
- **Playwright desktop suite green** for Pending Phase A (matrix A–J covered)
- Screenshots under `test-results/` for major cases
- Work-log entry written
- Human can paste this prompt again for Phase B when ready
