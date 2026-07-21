# Handoff — To Ship · Pending full-grid, **Stage B continuation**

> **Audience:** next coding agent continuing the Pending full-grid refactor.
> **Predecessors:** [`to-ship-pending-full-grid-handoff.md`](to-ship-pending-full-grid-handoff.md) (the master plan) and
> [`to-ship-pending-sheets-grid-handoff.md`](to-ship-pending-sheets-grid-handoff.md) (locked-columns, DONE).
> **This doc:** picks up mid-Stage-B. Stage A + Phase 3 shipped; Phase 4 is built-but-uncommitted; Phase 5 + LedgerGrid remain.
> **Lane:** `topic/pending-grid` registered in `WORKTREE-LANES.md` + `dev-worktrees.json` (:3100) as bookkeeping; **work is on `main`** (the predecessor base was uncommitted there — see the master handoff §13). Keep working on `main`.

---

## 0. Status at a glance

| Stage / Phase | State | Where |
|---|---|---|
| **Stage A · Phase 1** — gridlines + cell chrome | ✅ DONE + **committed** | HEAD `960cf54d2` |
| **Stage A · Phase 2** — typed headers (registry + glyphs) | ✅ DONE + **committed** | HEAD `960cf54d2` |
| **Stage B · Phase 3** — resizable columns (persisted) | ✅ DONE + **committed** | HEAD `960cf54d2` |
| **Stage B · Phase 4** — frozen pane + 2-axis sticky + h-scroll + edge shadow | 🟡 **built, UNCOMMITTED** (working tree) | 6 files, see §3 |
| **Stage B · Phase 5** — row-height presets (density SoT) | ⬜ not started | — |
| **Stage B · promote** — `LedgerGrid` + compose `OrdersQueueTable` | ⬜ not started | — |

**Working tree right now** (uncommitted Phase 4 — the user manages commits; do not `git stash`):

```
 M src/components/dashboard/OrdersQueueTable.tsx
 M src/components/dashboard/orders-queue/OrderGroupSummary.tsx
 M src/components/dashboard/orders-queue/OrdersQueueColumnHeader.tsx
 M src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx
 M src/lib/dashboard-order-row-layout.ts
 M src/styles/globals.css
```

**Verify status:** every gate attributable to this work is green — `tsc` clean, all DS-ratchet guards pass, the grid unit test (`src/lib/dashboard-order-row-layout.test.ts`) passes, and the e2e (`tests/e2e/to-ship-pending-grid.spec.ts`, 4 tests) passes on the dogfood board via `--project=desktop`. **`npm run verify` overall is RED for reasons that are NOT this work** — a concurrent, untracked `tests/e2e/kiosk-intake-flow.spec.ts` has a `readonly storageState` typecheck error, and 3 owner-pool IDOR unit tests flake on `ECONNREFUSED`/`db down`. Don't chase those; they're other sessions' in-flight work + DB flakiness. Confirm with the filtered check in §6.

---

## 1. ⭐ The architectural finding + recommended long-term solution

**Finding:** the primary "To Ship → Pending" surface (`/dashboard?unshipped`) is the **vertical-only shelf-board** (`UnshippedShelfBoard` → swimlane bubbles), which renders `OrdersQueueTable` with **`noHorizontalScroll`** (`overflow-x-hidden`). So it **never scrolls horizontally**, and Phase 4's frozen column is **inert there** (correct + harmless — the 4 e2e tests pass unchanged — but invisible). The frozen pane only activates on **flat, full-width h-scroll consumers** (Packed / Labels / Staged / the search view). The master handoff's Phase 4 assumed Pending h-scrolls; the shelf-board is deliberately vertical (narrow lanes).

**Recommended long-term solution (the one to build):** don't force spreadsheet behavior into the vertical bubbles. Instead:

1. **Promote the grid capabilities (resize · frozen · h-scroll · row-height) into the `LedgerGrid` primitive, gated by a per-surface contract** — e.g. `scrollX?: boolean` + `frozenColumns?: string[]`. A surface opts in based on its shape.
2. **Flat, full-width consumers opt IN** → the full Airtable-class experience (frozen Product, horizontal scroll, resize). This is where Phase 4 shines: Packed / Labels / Staged / search, **and a new flat "grid" view of Pending**.
3. **Shelf-board bubbles stay vertical-only** (`scrollX:false`) → frozen inert, and **resize handles disabled** (or width clamped to the bubble) so a wide drag can't clip (today it does — see §4 "resize-clip").
4. **Offer a Pending view toggle** — `?view=board|grid` (the house **sidebar-mode** pattern, `.claude/skills/sidebar-mode`) so operators who want the spreadsheet get a **full-width grid view** as a sibling to the shelf-board bubbles. The bubble board stays the default scan-oriented view; the grid view is the database view. This gives the frozen/h-scroll/resize experience a home where it's coherent, and satisfies the master handoff's "Pending → full spreadsheet grid" intent without fighting the shelf-board's design.

> In short: **the spreadsheet grid is a VIEW MODE (flat, full-width), not a reskin of the vertical bubbles.** Build the capability into `LedgerGrid`, gate per-surface, and add the flat Pending grid view.

Until that's built, Phase 4 as-shipped is the right interim: capability present, active where h-scroll exists, inert (harmless) on the bubbles.

---

## 2. What each phase delivered (committed unless noted)

### Phase 1 — gridlines + cell chrome (committed)
- One shared cell SoT: **`ordersQueueGridCell({ rule, inset })`** in `src/lib/dashboard-order-row-layout.ts`. Header, every row, and the group summary all compose it → continuous vertical + horizontal hairlines.
- Cells butt together (`items-stretch`, dropped `gap-x-2`); each cell has a right `border-r border-border-hairline` (last column + lead select gutter suppressed) + a **horizontal-only `px-2` inset** (`ORDERS_QUEUE_CELL_INSET`). Deliberately **not** an `inset-*` intent — intents also set `paddingBlock`, which would fight the density-owned row height. Guard-safe (spacing guard bans only arbitrary-px).
- `role="columnheader"` added to header cells. **Zebra kept** (translucent `bg-surface-canvas/40`) — removing it cleanly needs the shared `CollapsibleGroupRow`; deferred to reviewer (and see §4 — it now interacts with the frozen bg).

### Phase 2 — typed headers (committed)
- `ColumnType` on `TableColumnSpec` (`src/lib/tables/table-columns.ts`); grew `ORDERS_QUEUE_COL` → the **`ORDERS_QUEUE_COLUMNS`** model (width + label + type + hideKey) that the template *and* header derive from.
- `ColumnTypeGlyph` (`src/components/ui/table-column-config/column-type-glyph.tsx`) — one-place type→glyph map (+ a new `Type` icon in `icons/actions.tsx`). **Glyphs render only on the flex columns (Product/Notes)** — the 40–88px fact columns can't fit glyph+label, and `#`/`#`/`#` (number/id) would ambiguate three headers. Header cells carry `data-col` (glyph-agnostic locking).
- **Bonus fix:** platform/order/tracking now actually hide when toggled in the Fields popover (the grid previously ignored those toggles). Gating added in `OrderIdentityChips` (`cells` layout) + `OrderGroupSummary` (both orders-queue-only).
- **Deferred (flagged):** per-column header **menu** (doesn't fit dense columns + redundant with the Fields button — revisit with resizable columns), per-column **sort** (the queue sort is a global 5-mode cycle owned by the board, not per-column), full **`role="grid"`** tree (a partial tree over day-bands + button-rows is invalid ARIA — lands with keyboard nav in the LedgerGrid promotion).

### Phase 3 — resizable columns, persisted (committed)
- **CSS-var template:** `ordersQueueGridTemplate()` = `var(--cf-col-<key>, <default>) …`. Set a var on the grid surface → every row reflows via CSS, zero React re-render.
- **`useColumnWidths(tableId)`** (`src/components/ui/table-column-config/useColumnWidths.ts`) — persists px widths to `staff_preferences.tableColumns[tableId].widths`, mirroring `TableColumnConfig`'s optimistic write; both writers preserve the sibling field.
- **`ColumnResizeHandle`** (`src/components/dashboard/orders-queue/ColumnResizeHandle.tsx`) — drag mutates only the surface var (found via `closest('[data-cf-grid]')`), commits on drop; keyboard `←/→` nudge; double-click / Enter = resize-to-fit. Bespoke `h-full w-2` strip (passed the control-size guard as-is).
- `OrdersQueueTable` applies `ordersQueueColumnVars(widths)` to the scroll body (`data-cf-grid`) and passes `setWidth` → header.
- **GOTCHA fixed:** the `/api/staff-preferences` Zod schema (`src/lib/schemas/staff-preferences.ts`) `.strict()` per-table object only allowed `hidden` — the `widths` PUT was rejected → the optimistic width **rolled back**. Added `widths` to the schema. **If you add another `tableColumns` sub-field, update that schema too.**
- e2e: resize +120 → widened → reload → **persisted** → restore. Passing.

### Phase 4 — frozen pane + 2-axis sticky + scroll shadow (BUILT, UNCOMMITTED)
- `src/lib/dashboard-order-row-layout.ts`: `ORDERS_QUEUE_FROZEN_KEYS = ['select','status','title']`, `isOrdersQueueFrozen`, `ordersQueueFrozenLeft(key)`, `ORDERS_QUEUE_FROZEN_CELL = 'sticky z-raised bg-inherit'`.
- Frozen chrome threaded into all three renderers' select/status/title cells (header, row, group). Header freezes both axes (row already `sticky top-0 z-sticky`; cells add `sticky left`). z-scale: `raised`(10) < `sticky`(30) < `header`(40), so the header stays above body-frozen cells during vertical scroll.
- **Scroll shadow:** `OrdersQueueTable` `onScroll` toggles `.cf-grid-scrolled` on the surface (direct classList, no React state); CSS in `globals.css` hangs a right shadow off `[data-frozen-edge]` (the title cell).
- **GOTCHA fixed:** frozen offsets must include the row's `px-3` inset or every pinned cell drifts 12px left on scroll. `ordersQueueFrozenLeft` starts from `calc(0.75rem * var(--cf-density, 1))` (density-aware `QUEUE_ROW.px`). After the fix the title pins pixel-perfect (`457→457` on a 350px scroll).
- **Verified** only by force-enabling `overflow-x:auto` in a throwaway test (the shelf-board can't scroll — §1). Freeze mechanics are correct.

---

## 3. File map (this initiative)

**Committed (HEAD `960cf54d2`)** — Stage A + Phase 3:
- `src/lib/dashboard-order-row-layout.ts` — grid SoT: `ORDERS_QUEUE_COLUMNS`, `ordersQueueGridCell`, CSS-var template, `ordersQueueColumnVars`, `ORDERS_QUEUE_RESIZABLE_KEYS`, `ORDERS_QUEUE_CELL_INSET`.
- `src/lib/dashboard-order-row-layout.test.ts` — unit tests (cell chrome, template, model, resize helpers).
- `src/components/dashboard/orders-queue/{OrdersQueueColumnHeader,OrdersQueueTableRow,OrderGroupSummary}.tsx` — cell chrome + typed header + resize handle.
- `src/components/dashboard/orders-queue/ColumnResizeHandle.tsx` — resize handle.
- `src/components/ui/OrderIdentityChips.tsx` — `gridCellClass` prop + hide-gating for platform/order/tracking (cells layout).
- `src/components/ui/table-column-config/{useColumnWidths.ts,column-type-glyph.tsx,TableColumnConfig.tsx}` — width hook, glyph map, widths-preserving hidden write.
- `src/lib/tables/table-columns.ts` — `ColumnType` + `TableColumnSpec.type/align`.
- `src/lib/schemas/staff-preferences.ts` + `src/lib/neon/staff-preferences-queries.ts` — `widths` in the PUT schema + `StaffPreferences` type.
- `src/components/icons/actions.tsx` — `Type` glyph.
- `tests/e2e/to-ship-pending-grid.spec.ts` — extended (gridlines, cell-lock, typed glyph, resize+persist).
- `docs/portfolio/WORKTREE-LANES.md`, `dev-worktrees.json` — lane bookkeeping.

**Uncommitted (working tree)** — Phase 4 (the 6 files in §0). No new files; all edits to existing.

---

## 4. Immediate next steps (per the recommended plan, §1)

**Phase 4 polish (small, do first if keeping frozen):**
- **bg bleed:** frozen cells use `bg-inherit`; on translucent-zebra rows (`bg-surface-canvas/40`) the scrolling cells faintly show through the pinned pane. Fix by giving frozen cells an **opaque** bg (either make the zebra opaque — touches the Phase-1 look, reviewer-flagged — or set an explicit opaque bg on frozen cells that tracks the row state). Header frozen cells inherit `bg-surface-canvas/95` (95% + blur → negligible bleed).
- **resize-clip:** on `noHorizontalScroll` surfaces (shelf-board bubbles) a wide resize clips the right columns (no scroll to reveal them). **Disable the resize handles when `noHorizontalScroll`** (thread a prop from `OrdersQueueTable` → header → `onResizeColumn` = undefined), or clamp widths to the container.

**Phase 5 — row-height presets (density SoT):**
- Add a short/med/tall control (segmented) that writes `?density=`; map density → row `py` in `useTableDensity`/`table-density.ts` (already returns `rowPadding`). **Font size never changes** (type-scale guard). Reconcile `floor/ops/rollup/studio` vs short/med/tall via a presentation-only mapping — don't fork a second density axis. Frozen offsets already density-aware (`var(--cf-density)`), so they follow row height for free.

**Promote `LedgerGrid` (the endgame, §1):**
- Extract into `@/design-system/components/grid/` — `LedgerGrid`, `LedgerGridHeader/Row`, `useColumnWidths` (move it here), `useGridKeyboardNav`, the `columnType` registry — driven by a **column model** (`ORDERS_QUEUE_COLUMNS` is the prototype). Gate `scrollX` + `frozenColumns` per surface (§1). Full `role="grid"` keyboard nav lands here.
- Refactor `OrdersQueueTable` to compose it; keep Packed/Labels/Staged/Shipped working. Add the flat Pending **grid view** + view toggle.
- Ask-first (many call sites) — the master handoff already flags this; the user has approved Stage B but wants this done as the *proper* primitive, not a big-bang. Recommend building `LedgerGrid` behind the flat consumers first, then migrating.

---

## 5. Decisions / deviations already made (don't re-litigate)

- **Work on `main`, not a physical worktree** — the predecessor base was uncommitted on `main` (user chose this). Lane registered as bookkeeping only.
- **`px-2` cell inset, not an `inset-*` intent** — intents carry `paddingBlock` (fights density row height). Centralized as `ORDERS_QUEUE_CELL_INSET`.
- **Glyphs on flex columns only** (Product/Notes) — dense fact columns can't fit glyph+label without ambiguity.
- **Per-column menu / sort / full role=grid deferred** — see Phase 2 above.
- **Zebra kept translucent** (Phase 1) — but it now bleeds under the frozen pane (§4); opacity is the coupled decision.

---

## 6. How to verify

```bash
# Filtered typecheck (ignore the concurrent kiosk spec's error):
npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'error TS' | grep -v kiosk-intake-flow   # → empty = clean

# DS guards + grid unit test:
npx tsx --test $(find src -name '*.guard.test.ts') src/lib/dashboard-order-row-layout.test.ts   # → all pass

# e2e against the dogfood board (dev server on :3000, auth minted in tests/.auth):
npx playwright test tests/e2e/to-ship-pending-grid.spec.ts --project=desktop   # → 4 passed
#   (the qa-desktop project fails: "QA session not minted … provision:qa-org" — env, not code.)
```

- **Frozen column can't be exercised on `/dashboard?unshipped`** (shelf-board = `noHorizontalScroll`). To test freeze, force `overflow-x:auto` on `[data-testid="column-table-body"]` in a throwaway spec, or test a flat h-scroll consumer.
- **`npm run verify`** is red from concurrent work (kiosk typecheck + IDOR DB flakiness), not this initiative — verify the two gates above instead, or re-run after the concurrent work settles.
- **Visual QA:** drive `/dashboard?unshipped` with Playwright and screenshot to the scratchpad (Playwright cleans `test-results/`).

---

## 7. Gotchas learned (save yourself the debugging)

1. **`staff_preferences` PUT is `.strict()`** (`schemas/staff-preferences.ts`) — extend the schema whenever you add a `tableColumns` sub-field, or the optimistic write silently rolls back.
2. **Frozen sticky-left must include the row's `px-3`** or cells drift 12px (`ordersQueueFrozenLeft`).
3. **`ordersQueueGridCell` uses `items-stretch`** on the shell so `border-r` runs full height — don't revert to `items-center`.
4. **The tree is a shared soup** — other sessions commit/edit concurrently (`kiosk-intake-flow.spec.ts`, `station/workbench/*`, IDOR libs). Attribute failures carefully; leave in-flight changes untouched.
5. **`data-cf-grid`** on the scroll body is the resize/freeze anchor (`closest('[data-cf-grid]')`); `data-frozen-edge` marks the title cell for the shadow; `data-col` on header + body cells is the lock/e2e anchor. Keep all three.
