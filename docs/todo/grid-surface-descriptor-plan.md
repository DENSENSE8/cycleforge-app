# Plan — Grid Surface Descriptor (pluggable Workbench tables)

> **Status: Phases A–D LANDED 2026-07-22** (Fable 5, full-plan run) ·
> **§7.3 unified prefs + W1 URL sorts LANDED 2026-07-26** ·
> **Phase E still gated (ask-first — decision pending)**.
>
> ### 2026-07-26 — §7.3 (unified prefs / descriptor-owned visibility) + W1 (URL sorts)
>
> Closes the two-visibility-systems defect. Before: TanStack `columnVisibility`
> dropped a grid TRACK while `useIsColumnHidden()` blanked a chip/meta SLOT
> inside the cell, so hiding a column left a dead empty ruled band and the
> header / row / group summary each re-derived "is this hidden?" independently.
>
> - **`useGridColumnVisibility`** (`components/grid/useGridColumnVisibility.ts`)
>   is now the single resolution point: descriptor `tier` + persisted staff
>   delta + ephemeral viewport force-hide → the visible column list, which the
>   view hands to the header, rows, summaries **and** its geometry fn. Geometry
>   was already list-derived in all six families, so no template rework was
>   needed. Pure core (`resolveGridColumns` / `isGridColumnVisible`) is unit
>   tested (`grid-column-visibility.test.ts`, 11 cases).
> - **`tier: 'core' | 'optional'`** on `LedgerGridColumnModel` makes the
>   descriptor the SoT for the DEFAULT set. Grids open **lean**; staff opt in.
>   Receiving core = `select · title · date · qty · stage · order · tracking`;
>   `condition` / `platform` / `serial` are opt-in (usually still empty at scan
>   time). Locked by `grid-column-tier.guard.test.ts`.
> - **Prefs are a DELTA**, not an absolute list — `hidden` (core opt-outs) +
>   new `shown` (optional opt-ins) in `staff_preferences.tableColumns[tableId]`.
>   No migration (JSONB). This is what lets a new `optional` column ship without
>   widening anyone's grid, and the lean default widen later without re-showing
>   a track a staffer curated away.
> - **`GridFieldsMenu`** is generated from the descriptor (offered iff the column
>   has a `hideKey`), so `select`/`title` can never be hidden and a new column
>   appears in the menu automatically. Quiet trailing chrome per
>   `workbench-sort-chrome.mdc`.
> - **`useIsColumnHidden` retired from the grid families** (kept for the legacy
>   `ChipColumns` / `RowMetaColumns` primitives, ~50 non-grid consumers).
> - **W1 — URL sorts:** `useUrlColumnSort` extracts the engine the house had
>   already copy-pasted twice (`useQueueDisplaySort`, `useRepairDisplaySort`).
>   **`?colsort=` / `?coldir=`, NOT `?sort=`/`?dir=`** — recon found `?sort=` is
>   already owned by *server* ordering on `/incoming` (`useIncomingFilters`,
>   `zoho_newest`) and History (`normalizeHistorySort`); reusing it would have
>   made a header click rewrite the server query with an invalid value. Both
>   params registered in `MODE_SCOPED_PARAMS` and `stripCrossSurfaceParams`
>   (which was also missing a `dir` strip — fixed).
>
> Still open from the all-tables prompt: **W2** (Phase E grouping), **W4** (cell
> tokens), **W5** (~11 bespoke `<table>`s → `DataTable`), **W6** (v9 eval).
>
> - **A** — `@tanstack/react-table` v8.21.3; `useGridSurface` waist
>   (`"use no memo"`) in `src/design-system/components/grid/`; mode column defs
>   (`orders-queue-column-defs.ts`: `fulfillment.default` / `fulfillment.tested`);
>   TESTED lane ships **Tester + Tested at** (Status demoted) per §9; house
>   geometry / order-folds / editors / URL SoT intact. Playwright matrix green
>   (`pending-grid-tanstack-tested.spec.ts` + extended `to-ship-pending-grid` /
>   `orders-queue-skin-scoping` / rewritten `unshipped-virtual-list`); includes a
>   real sticky-header fix (LedgerGrid **split-x mode** — ancestor-scroll
>   h-scroll surfaces now dock the header to the page port; `--cf-grid-sx`).
> - **B** — shared VALUE cell registry `src/components/ui/grid-cells.tsx`
>   (dash / date / age / platform-mark / staff / datetime); Pending + Incoming +
>   Receiving rows and group summaries compose it.
> - **C** — `grid-surface-descriptor.ts` (`buildLedgerColumnDefs`,
>   `makeGridSurfaceDescriptor`, `GridSurfaceDescriptor`, `meta.gridColumn`) +
>   `LedgerGridSurface` composer; `IncomingGridView` + `ReceivingGridView`
>   migrated onto descriptors (TanStack owns their sort state; house compare
>   still orders rows). Pending keeps direct `LedgerGrid` composition (URL sort
>   / force-hide / drag order chrome).
> - **D** — `DataTable` boundary documented in `DESIGN_SYSTEM.md`; its simple
>   `{ key, header, cell }` schema deliberately unshared (different job).
> - **E (gated)** — TanStack grouping on day-band surfaces (`StationListTable`,
>   `FbaBoardTable`, `RepairTable`). Triple-marked ask-first (here, §12, and the
>   execution prompt's approval gate); no live consumer benefit today — grouping
>   / day bands remain house (`VirtualGroupedSections`). The descriptor + surface
>   seams from C make later adoption a bounded change; do not start without an
>   explicit human GO.
>
> Engine decision: **hybrid B-** (TanStack Table v8 headless + in-house
> `LedgerGrid`). Companions: `pending-grid-status-column-plan.md`,
> `pending-grid-minimal-simplify-handoff.md`.
> **Fable 5 bootstrap (Phases A–D, executed):**
> [`grid-surface-descriptor-EXECUTION-PROMPT.md`](./grid-surface-descriptor-EXECUTION-PROMPT.md).
> **Run record + full per-row Playwright matrix verdicts:**
> [`grid-surface-descriptor-phase-a-RUN-NOTES.md`](./grid-surface-descriptor-phase-a-RUN-NOTES.md).
> **NEXT RUN — hand-off prompt (grants Phase E + §7.3; adds URL sorts, cell
> tokens, bespoke-table collapse):**
> [`all-tables-improvements-EXECUTION-PROMPT.md`](./all-tables-improvements-EXECUTION-PROMPT.md).
>
> **Audience:** next coding agent (or Gemini Pro follow-up). Do **not** invent a
> MegaTable / schema-auto-CRUD / foreign UI grid. Grow `LedgerGrid` + mode
> descriptors; adopt TanStack Table only as the **headless state engine**.
>
> **Product framing (locked):** this work **upgrades Kinetic Ledger** — makes
> the house DS more unique, compound, and ops-special — it does **not** replace
> Kinetic Ledger with shadcn/ui, AG Grid, MUI, or any foreign visual language.
> Headless libraries (TanStack Table) may power *state math*; presentation,
> tokens, cells, and region contracts stay Kinetic Ledger.

---

## One-sentence pitch

**Upgrade Kinetic Ledger’s Workbench spreadsheet into a world-class ops grid
system** — TanStack Table headless for column/sort/visibility state,
`LedgerGrid` + Kinetic Ledger cells for DOM/tokens, mode descriptors for
per-status layouts. First slice = Pending only: `ustatus=TESTED` (**tester** +
**tested-at**) authored as TanStack column defs. Not “a table for every DB
table”; not a shadcn/AG Grid succession.

---

## Engine decision (research brief) — **hybrid B-**

### One-line recommendation

**Adopt hybrid B-:** migrate internal grid **state** to TanStack Table v8
(headless), while keeping the in-house `LedgerGrid` shell,
`@tanstack/react-virtual` DOM virtualization, and Kinetic Ledger UI components.

Repo fact (2026-07-22): `@tanstack/react-virtual` is already a dependency
(`package.json`); `@tanstack/react-table` is **not** yet installed — **install
it in the first Pending slice** (see § Engine sequencing validation). The
package alone is near-zero risk (headless; no markup/tokens).

### Scorecard

| Criteria | A: In-house status quo | **B-: TanStack Table (headless)** | AG Grid | MUI X Data Grid | Glide Data Grid |
|---|---|---|---|---|---|
| React 19 / Next 16 | Pass | Pass | Pass (v34.3) | Pass | Fail (known 19.1 issues) |
| Data / mutation control | High | High | Medium (foreign store) | Medium (foreign store) | Medium |
| Token theming | High | High | Low (heavy CSS override) | Low (MUI ecosystem) | Low (JS object / canvas) |
| Feature coverage | Medium (hand-rolled) | High (state engine provided) | High (paywalled) | High (paywalled) | High |
| Accessibility (a11y) | Medium | High | High | High | Low (canvas limits) |
| License / cost | Free | Free | Paid (Enterprise for advanced) | Paid (Pro for pinning / reorder) | Free |
| Migration effort | S | **M** | XL | L | XL |

**Why B- wins:** TanStack Table v8 solves hand-rolling complex table logic
(sorting, column resizing, pinning state) without surrendering DOM structure,
Tailwind / Kinetic Ledger tokens, or optimistic mutation workflows to a heavy
third-party UI component.

### Compatibility & licensing facts (validated)

| Claim | Verdict |
|---|---|
| Adopting AG Grid / MUI / Glide means re-implementing tenancy, permissions, optimistic writes, and re-theming a foreign component | **True.** Deep Tailwind investment + paywalled features (MUI Pro for pinning/reorder; AG Grid Enterprise for grouping / range selection). |
| Already on `@tanstack/react-virtual` → TanStack Table headless is the lowest-friction upgrade | **True.** Table v8 outputs zero markup; designed to pair with TanStack Virtual. |
| Canvas grids (Glide) trade a11y + CSS-token theming for spreadsheet feel | **True.** React 19 / 19.1.1 incompat issues (#1189, #1122); canvas limits screen-reader semantics. |
| Full Airtable clones (Teable / NocoDB / Baserow) are not embeddable as controlled components | **True.** Full-stack / BaaS — own auth + schema; cannot map over multi-tenant Postgres + `useOrderAssignment` optimistic waist. |

### Explicitly closed options

| Option | Why closed |
|---|---|
| **Glide Data Grid** | Broken on React 19; fails CSS-token theming; canvas a11y fail |
| **AG Grid** | Heavy restyle vs Kinetic Ledger; row grouping / range selection Enterprise-gated |
| **MUI X Data Grid** | Material styling conflicts; column pinning requires Pro |
| **Teable / NocoDB / Baserow** | Standalone DB platforms, not embeddable controlled React grids |
| **react-data-grid** | Layout / Strict Mode friction; no real benefit over TanStack headless |
| **In-house MegaTable / schema auto-CRUD** | Strips scan-aware visual contracts; banned elsewhere in this plan |

### Migration sketch (TanStack Table headless + `LedgerGrid`)

Replaces manual prop-drilling and bespoke grid-state hooks with TanStack’s
state engine; **UI stays untouched**.

**What changes**

- Column defs rewrite into TanStack `createColumnHelper` (fed by
  `GridModeDescriptor` / `ordersQueueColumnsFor`)
- Header widths, resize drag-handlers, pinning offsets from TanStack API
  instead of manual math
- Grouping / sorting state delegated to the hook (URL/`?sort=` remains the
  durable source of truth — TanStack mirrors it)

**What we keep**

- `LedgerGrid` DOM structure + `gridSkin="airtable"`
- `@tanstack/react-virtual` (v3) via `VirtualGroupedSections`
- All cell editors (`cell-editors.tsx`), popovers, Kinetic Ledger tokens
- Data fetching + optimistic mutation waist (`useOrderAssignment`, etc.)

**Effort tier:** **M** (UI exists; work is wiring).

**Top risks (Pending-first slice)**

1. Reconciling TanStack column visibility / order with house
   `ordersQueueGridTemplate` / `--cf-orders-grid-w` / frozen sticky offsets /
   viewport force-hide (geometry stays house CSS; TanStack must not invent a
   second width system in slice 1)
2. Global scan-focus hotkey (**F2**) + keyboard nav staying clear of the new
   state object
3. **Not on Pending:** sticky day-band headers ↔ TanStack grouped row model ↔
   virtualizer indices — that hazard lives on Incoming / Receiving / station
   feeds. Quarantine TanStack **grouping** until those surfaces. Pending still
   has house **order-fold** groups (`orderGroupsByDate` + `QueueGroupRow`);
   leave those outside TanStack.
4. **React Compiler × TanStack Table v8** — see § React Compiler trap below.
   Real if/when the compiler is on; cheap to preempt in Phase A.

**Open question**

- **Excel-like click-and-drag range selection + fill handle** is not built into
  TanStack Table. Row/cell selection is fine; range/fill still needs custom DOM
  event logic on top of headless state. Defer unless dogfood asks.

### React Compiler trap (TanStack Table v8)

The research brief correctly says TanStack Table v8 works with **React 19**.
There is a separate, well-documented trap when the **React Compiler**
auto-memoizes components (Next `experimental.reactCompiler` /
`babel-plugin-react-compiler`).

**Risk:** `useReactTable` predates the compiler. Methods like
`table.getRowModel()` / `getHeaderGroups()` return **new object references
during render** while appearing parameterless/pure to the compiler. Aggressive
memoization can **freeze rows** — UI stops updating on sort / visibility /
data changes. Tracked upstream (e.g. TanStack/table#5567, facebook/react#33057,
#36331). Newer compiler builds may *skip* compiling callers of
`useReactTable`, but values passed into still-memoized children can still go
stale — treat opt-out as required, not optional folklore.

**Repo fact (2026-07-22):** `next.config.ts` does **not** currently enable
`reactCompiler`. The trap is inactive today but becomes live the moment the
compiler is turned on. Phase A still ships the mitigation so a later compiler
flip does not brick Pending.

**Phase A mitigations (pick one; prefer 1 until v9 is clearly stable):**

1. **`"use no memo"`** at the top of the module that owns `useGridSurface` /
   `useReactTable` (and any child that reads `table.getRowModel()` /
   `getHeaderGroups()` / selection helpers into JSX). Directive must be first
   in the file / function scope per React docs. Optionally a fine-grained
   helper:

   ```ts
   function useNoMemo<T>(factory: () => T): T {
     'use no memo';
     return factory();
   }
   // e.g. const rows = useNoMemo(() => table.getRowModel().rows);
   ```

2. **Evaluate TanStack Table v9** (alpha / RC at research time — refactors for
   compiler compatibility). Only switch if agents verify a stable-enough
   release at implementation start; default remains **v8 + `"use no memo"`**.

**Do not** “fix” by turning the React Compiler off globally.

### Engine sequencing validation (2026-07-22)

Critique: the plan conflated **npm install** with **live wiring**, and deferred
TanStack partly for a day-band risk that Pending does not carry.

| Claim | Verdict | Code fact |
|---|---|---|
| Installing `@tanstack/react-table` is near-zero risk (headless; no foreign aesthetic) | **True** | Zero markup/CSS; same TanStack family as `react-virtual` + `react-query`. `AGENTS.md` “no foreign grid” targets UI grids (AG Grid / MUI / Glide), not headless state. |
| Wiring is the real **M** work | **True** | Sort / visibility / order ↔ URL + staff prefs + force-hide + frozen pane. |
| “Ask-first before installing” gates a non-risk | **True — gate removed** | Ask-first applies to public `LedgerGrid` API changes and multi-surface grouping, not the package. |
| Pending has no day-band grouping → safest adopt surface | **True for sticky day headers** | `LedgerGrid` default `showDayHeaders={false}`; Pending does not paint day bands. |
| Pending is “flat / no groups” | **False — correct the wording** | Pending **does** pass `orderGroupsByDate` + `renderGroup` for **order-id folding** (`QueueGroupRow` / `CollapsibleGroupRow`). Composite sorts still key bands by date in data, but headers are hidden. Do **not** map this to TanStack’s grouped row model in slice 1. |
| Hand-rolling `GridColumnDef` then re-expressing as `createColumnHelper` is double work | **True** | Author TESTED / mode columns as TanStack `ColumnDef`s (or a 1:1 thin wrapper) from day one. |
| Plan sequencing only isolates unknowns, doesn’t make the package dangerous | **True** | Isolating TESTED swap from engine swap is a debugging preference, not a safety rule. |
| Pending has live drag-resize to reconcile | **Mostly false today** | `OrdersGridView` does **not** pass `onResizeColumn`; minimal-simplify retired drag-resize on Pending. Slice 1 can leave track widths on house CSS (`ORDERS_QUEUE_COLUMNS` / `--cf-orders-grid-w`). |

**Adopted sequencing (replaces “Phase A without TanStack → Phase E engine”):**

1. **Install `@tanstack/react-table` now.**
2. **Pending-only bounded slice:** state = **columns + sorting + visibility**
   (and column order if it drops in cleanly). **No** TanStack grouping, range,
   or fill. Keep house order-fold + `VirtualGroupedSections` as today.
3. Author the first TESTED descriptor **as TanStack column defs** (tester +
   tested-at) — skip a throwaway house-only column model.
4. Leave Incoming / Receiving day-band + grouping adoption for a
   **separately scoped** later pass.
5. Optional isolation: if dogfood debugging is noisy, land TESTED cells on
   current geometry first in a same-PR stacked commit — still one package,
   still TanStack defs — not a multi-week Phase E deferral.

### How B- maps onto this plan’s layers

| Layer (this plan) | Pending slice 1 (now) | Later surfaces |
|---|---|---|
| DS shell (`LedgerGrid`) | Keep | Keep |
| Virtualization | Keep `@tanstack/react-virtual` | Keep |
| Column / mode descriptor | TanStack `ColumnDef` / `createColumnHelper` fed by mode | Same |
| Headless state (`useGridSurface`) | TanStack Table: columns + sort + visibility | + grouping only when day bands need it |
| Cell registry / Kinetic Ledger | House cells | House cells |
| Order / PO folds | House `QueueGroupRow` (outside TanStack) | Same until proven otherwise |
| Fetch / mutations | Existing React Query + hooks | Unchanged |

---

## 1. Problem statement

Building every ops table by hand is too slow. Operators need **different column
layouts for different tables, modes, and lifecycle states** — e.g. when the
Pending / To-Ship queue is filtered to **TESTED**, the grid should surface
**tester staff name + tested date/time**, not only a static `TESTED` pill.

**Goal:** an all-purpose plug-in that any adapted Workbench page can mount for
any DB-backed queue/list, with unique column models per surface/mode, without
forking sticky-header / virtualization / selection chrome each time.

**Non-goal:** auto-generating UI from raw Postgres / Drizzle schema for every
table. Cycle Forge is Kinetic Ledger ops SaaS — tables are **presentation
contracts over domain row VMs**, not CRUD over DDL.

---

## 2. Product / design constraints (must obey)

- **Kinetic Ledger** — dense, state-colored, scan-aware Workbench tables.
  Compose house SoTs; do not import a foreign grid aesthetic.
- **Region contract:** Workbench table/queue recipe
  (`.claude/rules/display/workbench.md`). Station pages must not grow competing
  browse grids.
- **Presentation kinds via SoT** — dates (`src/utils/date.ts`), condition
  (`src/lib/conditions.ts` / tone), platform marks, status chips
  (`FULFILLMENT_STATE_META`, etc.). Views stay dumb.
- **Pattern evolution:** grow existing registries; do not invent a parallel
  MegaTable beside `LedgerGrid` / `DataTable`.
- **Engine:** TanStack Table = **headless state only**; never replace
  `LedgerGrid` markup with AG Grid / MUI / Glide / canvas grids (see Engine
  decision).
- **Never** raw status `UPDATE`s; tenant via `withTenantTransaction`; search via
  hybrid retrieval waist.

---

## 3. What already exists (ground truth)

### Two table shells (do not collapse incorrectly)

| Shell | Path | Job |
|---|---|---|
| **`LedgerGrid`** | `src/design-system/components/grid/LedgerGrid.tsx` | Virtualized Workbench **spreadsheet** (Pending golden path). Sticky header, optional page-scroll parent, `gridSkin="airtable"`. Domain cells stay **outside** DS. |
| **`DataTable`** | `src/design-system/components/DataTable/DataTable.tsx` | Simpler HTML table for lifecycle/admin boards (e.g. `FbaShipmentsTable`). Column schema = `{ key, header, cell, align, width }[]`. |

DS rule (`DESIGN_SYSTEM.md`): **compose `LedgerGrid` + thin domain composer**;
do not fork sticky/scroll/virtual chrome.

### Domain composers already forked by surface

| Composer | Column SoT | Surface |
|---|---|---|
| `OrdersGridView` | `ORDERS_QUEUE_COLUMNS` in `src/lib/dashboard-order-row-layout.ts` | Outbound Pending / Packed / Labels / Staged / Shipped |
| `IncomingGridView` | `INCOMING_GRID_COLUMNS` in `src/lib/receiving/incoming-grid-layout.ts` | `/incoming` POS |
| `ReceivingGridView` | `RECEIVING_GRID_COLUMNS` in `src/lib/receiving/receiving-grid-layout.ts` | Unbox / History / Testing |

Shared scan family, **different fact tracks**:

- Pending: `select · title · date · age · status · qty · cond · platform · order · tracking`
- Incoming: swaps status meaning (delivery), different labels
- Receiving: `stage` + `serial`, no age/status fulfillment chips

### Mode registries (data layer — strongest “plug” precedent)

`src/lib/receiving/receiving-modes.ts` — **descriptor per table mode**
(`receive` / `history` / `incoming` / `unbox_queue` / `unbox_viewed`):

- which API `view`
- query key / params
- group axis / sort / empty copy
- flags for presentational forks

Historically ~40 `isHistoryMode` ternaries → one wrong branch = cross-
contamination. **This is the house pattern for “plug different behavior into
one mounted table.”**

Companion SoT: `src/lib/receiving/receiving-views.ts` (`?view=` union shared by
client + API).

### Column hide / prefs (not column *definition*)

- Registry: `src/lib/tables/table-columns.ts` — `TableId` =
  `receiving | orders | shipped | tech | testing | packer`
- Runtime: `TableColumnConfigProvider` — staff hide/show via
  `staff_preferences.tableColumns`
- Also: column order/widths hooks; outbound **Full/Ops/Minimal presets** in
  `TableOptionsMenu`

Today’s registry is **toggle keys for shared chip/meta slots**, not a full
schema of spreadsheet columns. Spreadsheet columns live in the
`*_GRID_COLUMNS` / `ORDERS_QUEUE_COLUMNS` SoTs.

### Status filter vs column model (the TESTED gap)

- URL filter: `?ustatus=PENDING|TESTED|BLOCKED` via `useToShipStatusFilter`
- Status **chip** column already landed (`pending-grid-status-column-plan.md`)
  using `deriveFulfillmentState` + `FULFILLMENT_STATE_META`
- Row payload **already has** tester facts in places: `tested_by`,
  `tested_by_name` / `tester_name`, `test_date_time`, `test_activity_at`
- **Missing:** when `ustatus=TESTED` (or Pack Queue default TESTED), columns do
  **not** swap to staff + tested instant. Same `ORDERS_QUEUE_COLUMNS` for all
  fulfillment lanes.

---

## 4. Why “hand build every table” hurts

Today a new grid means roughly:

1. New `*GridColumn` SoT (keys, widths, types, hideKeys)
2. New `*GridView` composer wrapping `LedgerGrid`
3. New `*ColumnHeader` / `*GridRow` / group summary (often copy-adapted)
4. Wire fetch / view / sort / selection / chrome
5. Optional `TableId` + staff prefs
6. Tests locking scan order (`incoming-grid-layout.test.ts` style)

That’s intentional for **blast-radius control**, but it doesn’t scale when the
ask is “every mode/status needs unique columns.” The duplication is in
**column model + cell registry + mode→projection**, not in the shell (shell is
already shared). Hand-rolled **sort / resize / pin state** is the second
pain — B- addresses that without replacing the shell.

---

## 5. Recommended architecture (near-term)

### Core idea: **Grid Surface Descriptor** (extend receiving-modes)

One mounted shell (`LedgerGrid` or `DataTable`), many descriptors:

```ts
type GridSurfaceId =
  | 'outbound.pending'
  | 'inbound.incoming'
  | 'receiving.history'
  // …

interface GridColumnDef<Row> {
  key: string
  width: string
  label?: string
  type?: ColumnType          // from table-columns ColumnType
  hideKey?: string           // staff prefs
  sortable?: boolean
  // Phase A may still use render fns; long-term → cellType tokens (see §7)
  header?: () => ReactNode
  cell: (row: Row) => ReactNode
  sortValue?: (row: Row) => string | number | null
}

interface GridModeDescriptor<Row, Ctx> {
  id: string                 // e.g. 'fulfillment.tested'
  columns: readonly GridColumnDef<Row>[]
  buildParams(ctx: Ctx): URLSearchParams
  queryKey(ctx: Ctx): readonly unknown[]
  mapRow?(raw: unknown): Row
  emptyMessage(ctx: Ctx): string
  defaultSort?: string
  lockedKeys?: readonly string[]  // select · title
}
```

**Mode / status chooses descriptor**, not scattered ternaries in the row
component. Column defs are TanStack `ColumnDef`s (or a thin 1:1 wrapper) from
the first Pending slice — do not author a throwaway house-only model.

### What “plug into any page” means here

1. Page picks **archetype** (Workbench table) + **surface id**
2. Page supplies **row type + fetch** (or reuses existing query modules)
3. Page mounts thin composer: `<LedgerGridSurface surfaceId="outbound.pending" mode={ustatus} … />`
4. Descriptor registry owns columns/cells/sort/empty (TanStack `ColumnDef`s)
5. Shell owns virtualization, sticky header, scroll contract, zebra, selection gutter
6. `useGridSurface` wraps TanStack Table (Pending slice 1: columns + sort +
   visibility) and returns props for (5)

Pages/modes do **not** reimplement `LedgerGrid`.

### Explicitly reject / defer

- Auto-CRUD from Drizzle schema for every table
- Runtime column builders from JSON without typed row VMs
- Second virtualizer / sticky-header implementation
- Foreign **UI** grids (AG Grid / MUI X / Glide / react-data-grid) — see Engine
  decision
- Raising DS-ratchet baselines or page-local status→class maps
- Collapsing Station scan UI into this plug
- Excel range-select / fill handle until dogfood asks

---

## 6. Layers to keep separate

| Layer | Owns | Must not own |
|---|---|---|
| DS shell | scroll, sticky, virtualize, skin | domain cells, status meaning |
| Column SoT / descriptor | keys, widths, types, which cells | SQL |
| Mode descriptor | API view, params, queryKey, empty | JSX layout chrome |
| Cell registry | typed cell renderers (status chip, cond pill, staff, datetime) | fetch |
| Headless state (B-) | sort / resize / pin / column visibility math | markup, tokens, mutations |
| Staff prefs | hide/order/width overlays | inventing columns |
| Domain API | row VM fields for every visible column | UI column keys |

Rule: **if a column is shown, the row VM must guarantee the field** (or an
explicit deferred load strategy). Don’t show Tester without server fields.

---

## 7. Gemini Pro validation + long-term evolution

> Validation of the proposed approach (Gemini Pro, 2026-07-22). Architecture
> diagnosed correctly: friction is coupling structural table chrome to specific
> data projections. Pattern aligns with scalable, domain-driven React design.

### Validation of the current proposal

1. **Accurate threat model** — Rejecting a MegaTable or auto-CRUD from Drizzle
   is correct. Ops platforms rely on precise visual contracts (status colors,
   condition badges) to prevent warehouse errors. Generic auto-CRUD would strip
   scan-aware Workbench nuance.
2. **Excellent separation of concerns** — Keep `LedgerGrid` purely structural
   (virtualization, sticky headers, zebra). Move column definitions into
   `GridModeDescriptor` so the blast radius of a new feature stays near zero.
3. **Pragmatic first surface** — Pending `ustatus=TESTED` is still the ideal
   proof (reuse `tester_name` / timestamps). Sequencing revised: adopt TanStack
   column defs on that same slice (see § Engine sequencing validation), not a
   later Phase E rewrite.

### Long-term best solution (next few cycles)

Evolve into a **Headless Grid State Engine** paired with **strictly typed cell
registries**. Establishing `GridModeDescriptor` now is the foundational
interface those capabilities need. **Research decision: that engine is TanStack
Table v8 (hybrid B-), not a house rewrite of sort/resize/pin.**

#### 7.1 Headless state — `useGridSurface` (backed by TanStack Table)

Sorting / selection / column visibility / active mode leave the wrappers and
live in a headless hook. Shells stay pure presentation:

```ts
// Pending slice 1 — TanStack Table inside; LedgerGrid still receives ReactNode props
const { tableProps, rows, headers } = useGridSurface({
  descriptor: testedModeDescriptor,
  data: fetchedRows,
  userPrefs: staffPreferences,
});
```

`useGridSurface` is the Cycle Forge waist: descriptors + staff prefs + URL sort
in; TanStack state out; **zero** TanStack markup.

#### 7.2 Declarative cell rendering (token registry)

Slice 1 may still use `cell: (row) => ReactNode` on TanStack defs. Prefer tokens
so descriptors stay lean and inbound/outbound cells stay consistent:

```ts
interface GridColumnDef<Row> {
  key: keyof Row & string
  width: string
  cellType: 'statusPill' | 'staffAvatar' | 'relativeTime' | 'conditionMark' | …
}
```

`LedgerGridSurface` maps `cellType` → shared Cycle Forge cell components
(compose existing SoTs; do not invent a second badge language). Under B-,
TanStack column `cell` callbacks are thin routers into this registry.

#### 7.3 Unified prefs + descriptor schema

Merge `table-columns.ts` hide keys with `*_GRID_COLUMNS` defaults. The
descriptor becomes SoT for default visibility, sortability, and min width.
Staff prefs store only an **override delta** (e.g. `["hide:tracking",
"show:tester"]`), and the Fields menu is generated from the descriptor.
TanStack column visibility state should mirror that delta — not a second store.

#### 7.4 Intelligent data hydration

As descriptors gain `buildParams` / `queryKey`, couple them to React Query:
`LedgerGridSurface` invokes the correct API view, owns loading/empty, and
renders rows. Fetch stays tenant-scoped via existing route helpers — the
descriptor does not open a second DB path. TanStack does **not** own fetching.

---

## 8. Implementation phases

### Phase A — Pending slice 1 (TESTED columns + TanStack headless)

Install `@tanstack/react-table` (v8 unless v9 is verified stable at impl time).
Bound to **Pending only**.

- Add dependency; wire `useGridSurface` / `useReactTable` for **columns +
  sorting + visibility** (column order if clean). **No** TanStack grouping /
  range / fill
- **React Compiler:** put `"use no memo"` on `useGridSurface` (and any consumer
  that calls `table.getRowModel()` / header-group accessors into render) — see
  § React Compiler trap. Required even though `reactCompiler` is off today
- Author mode column sets (incl. TESTED **Tester** + **Tested at**) as TanStack
  `ColumnDef`s via `createColumnHelper` — see §9 for field contract
- Keep house geometry: `ordersQueueGridTemplate`, `--cf-orders-grid-w`, frozen
  sticky offsets, viewport force-hide (Pending has no live drag-resize today)
- Keep house order-fold: `orderGroupsByDate` + `QueueGroupRow` outside TanStack
- Keep `LedgerGrid` + `VirtualGroupedSections` markup; Kinetic Ledger cells
- Optionally demote redundant Status pill when every row is TESTED
- Regression: F2 edit, frozen `select · title`, force-hide, PO folds,
  page-scroll sticky under `DashboardScrollShell`; if compiler is later
  enabled, re-check Pending sort/visibility updates still paint
- Unit-test column keys per mode (mirror `incoming-grid-layout.test.ts`)

### Phase B — Promote shared cell registry

Extract common cells (qty, cond, platform mark, order id, tracking, staff,
datetime) used by Pending / Incoming / Receiving. Descriptors compose cells;
stop copying cell JSX across `*GridRow.tsx`.

### Phase C — Generalize composer

One `LedgerGridSurface` that takes the mode descriptor. Migrate Incoming /
Receiving composers to descriptors (receiving-modes already halfway there for
data). **Still no TanStack grouping** until Phase E.

### Phase D — Admin / lifecycle boards

Keep `DataTable` for non-virtualized boards; share only column-def *shape*
where useful.

### Phase E — Day-band / grouped surfaces (ask-first)

Incoming / Receiving / station feeds that paint sticky day headers. Only here
does risk #3 (TanStack grouped row model ↔ `VirtualGroupedSections` indices)
apply. Separate blast radius from Pending.

**Ask-first before:** changing shared `TableId` prefs schema, public API
changes to `LedgerGrid`, TanStack **grouping** on day-band surfaces, Excel
range-select / fill handle.

---

## 9. Phase A data contract — `tester_name` / timestamps

Answer to: *How are `tester_name` and `test_activity_at` formatted in the raw
response, and do they need parsing before the descriptor?*

### 9.1 Pending / To-Ship feed (`/api/orders` — the Phase A surface)

| Field | SQL source (route) | Wire shape | Notes |
|---|---|---|---|
| `tester_name` | `staff_test_assignee.name` | `string \| null` | Work-assignment **assignee** display name |
| `tested_by_name` | same assignee join today | `string \| null` | On this route currently mirrors `tester_name` |
| `tested_by` | `test_activity.staff_id` | `number \| null` | Who actually recorded the test activity |
| `tester_id` | `wa_t.assigned_tech_id` | `number \| null` | Assignment id |
| `test_activity_at` | `to_char(test_activity.created_at, 'YYYY-MM-DD HH24:MI:SS')` | naive wall-clock **string** | No `Z` / offset suffix |
| `test_date_time` | **not selected** on this route | — | Do not rely on it for Pending Phase A |

### 9.2 Shipped / packer CTE feeds (`orders-queries` `ORDER_SERIALS_CTE`)

| Field | SQL | Wire shape |
|---|---|---|
| `test_date_time` | `MIN(tsn.created_at)::text` | Postgres text cast of timestamptz (session-dependent string) |
| `test_activity_at` | `to_char(test_sal.created_at, 'YYYY-MM-DD HH24:MI:SS')` | same naive `YYYY-MM-DD HH24:MI:SS` |
| `tested_by_name` | `staff` join on `os.tested_by` | `string \| null` — **scan** actor |
| `tester_name` | `staff` join on `os.tester_id` | `string \| null` — **assignee** |

Typed on `ShippedOrder` (`src/types/orders.ts`): timestamps are `string | null`;
staff names optional strings; ids `number | null`.

### 9.3 Parsing / presentation rules (reuse — do not invent)

House path already exists in
`deriveShippingDisplayMeta` (`shipped-details` helpers) and
`OrdersGridView` / `normalizePersonName`:

**Timestamp source (prefer in order):**

1. `test_date_time` (when present — serial MIN stamp)
2. `test_activity_at` (station activity — **Pending’s primary**)
3. optional `test_event_at` if ever present

**Guards before format:**

- Treat empty / whitespace as missing
- Ignore legacy sentinel `'1'`
- Pass the raw string to **`formatDateTimePST`** (`src/utils/date.ts`) — it
  already accepts naive `YYYY-MM-DD HH24:MI:SS`, ISO-ish casts, and Date; no
  custom Date parsing in the descriptor

**Compact grid cell (recommended Phase A):** either full
`formatDateTimePST(raw)` or a denser sibling if one exists for queue rows —
never `new Date(raw).toLocaleString()` in the cell.

**Staff display (prefer in order):**

1. `tested_by_name` (scan actor when distinct)
2. `tester_name` (assignee)
3. `getStaffName(tested_by)` / `getStaffName(tester_id)` via `useStaffNameMap`
4. Run through **`normalizePersonName`** (strips `tech:` prefixes / placeholders → `---`)

**No schema migration required for Phase A** on Pending: fields are already on
the `/api/orders` JSON. Confirm dogfood payloads still include
`test_activity_at` + at least one name/id for TESTED rows; if a spine-only
path ever drops them, hydrate before showing the columns.

### 9.4 Descriptor cell sketch (Phase A)

```ts
// Conceptual — prefer shared helpers, not inline maps
cell: (row) => {
  const raw =
    nonSentinel(row.test_date_time) ??
    nonSentinel(row.test_activity_at);
  return raw ? formatDateTimePST(raw) : '—';
}
// tester cell resolves name via the OrdersGridView precedence above
```

---

## 10. Key files

1. `src/design-system/components/grid/LedgerGrid.tsx`
2. `src/design-system/components/grid/VirtualGroupedSections.tsx` — `@tanstack/react-virtual`
3. `src/lib/dashboard-order-row-layout.ts` — `ORDERS_QUEUE_COLUMNS`
4. `src/components/dashboard/orders-queue/OrdersGridView.tsx` + `OrdersQueueTableRow.tsx` + `cell-editors.tsx`
5. `src/lib/receiving/receiving-modes.ts` — mode descriptor gold standard
6. `src/lib/receiving/incoming-grid-layout.ts` + `receiving-grid-layout.ts`
7. `src/lib/tables/table-columns.ts` + `TableColumnConfig.tsx`
8. `src/design-system/components/DataTable/DataTable.tsx` + `FbaShipmentsTable.tsx`
9. `src/app/api/orders/route.ts` — Pending row projection (TESTED fields)
10. `src/types/orders.ts` — `ShippedOrder` field types
11. `src/utils/date.ts` — `formatDateTimePST`
12. `docs/todo/pending-grid-status-column-plan.md` + `pending-grid-minimal-simplify-handoff.md`
13. `AGENTS.md` + `.claude/rules/display/workbench.md`
14. `package.json` — `@tanstack/react-virtual` present; add
    `@tanstack/react-table` in Phase A (Pending slice 1)

---

## 11. Success criteria

- New mode/status column layout = **new TanStack column set / descriptor**, not
  a new sticky-header table
- TESTED queue shows **staff + tested datetime** without breaking
  PENDING/BLOCKED
- TanStack owns Pending column/sort/visibility state; `LedgerGrid` markup +
  Kinetic Ledger cells unchanged; house order-fold unchanged
- `useGridSurface` ships with `"use no memo"` (React Compiler trap mitigated)
- No TanStack grouping on Pending; no foreign UI grid
- Presentation still goes through date/condition/status SoTs
- `npm run verify` green; no DS-ratchet baseline raises
- Compound: promote shared cells to registry when 2+ surfaces share them

---

## 12. Compound opportunities

- **Do now (Phase A):** install `@tanstack/react-table` v8; Pending-only
  columns+sort+visibility; TESTED tester + tested-at as TanStack `ColumnDef`s;
  `"use no memo"` on the grid waist.
- **Promote next:** shared cell registry; tokenize high-traffic cells; generalize
  `LedgerGridSurface`; merge `TableId` hide-registry with column defs.
- **Deferred / ask-first (Phase E):** TanStack grouping on day-band surfaces;
  descriptor-owned React Query hydration; Excel range-select / fill handle only
  if dogfood demands it; revisit **TanStack Table v9** when stable for native
  React Compiler compatibility (may retire `"use no memo"`).

---

## 13. Final verdict

The revised sequencing is sound. Scoping Phase A to the **Pending** queue,
isolating `ustatus=TESTED` columns, and using TanStack **only** for visibility,
sort, and column definitions — without altering DOM or the virtualization
strategy — keeps blast radius near zero. You get robust headless state math
without sacrificing the scan-aware, high-density Kinetic Ledger contracts that
make the ops platform effective.

Ship with eyes open on one architectural trap: **React Compiler × Table v8**.
Mitigate with `"use no memo"` on `useGridSurface` from day one; evaluate v9
later. Do not reopen AG Grid / shadcn succession.
