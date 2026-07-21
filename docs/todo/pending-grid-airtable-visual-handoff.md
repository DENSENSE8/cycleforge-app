# Handoff — Pending **Grid view** Airtable visual pass

> **Audience:** next coding agent. **Scope:** make the new Pending *Grid view* look like a real
> Airtable/spreadsheet. The plumbing works (frozen pane, resize, toggle, virtualization, e2e all
> green) — this is a **visual/UX** pass on four specific defects the user flagged from a screenshot.
> **Do NOT re-architect** — `LedgerGrid` + `OrdersGridView` are correct; restyle within them.

---

## 0. Where things stand (LedgerGrid Stage 1 — LANDED, uncommitted on `main`)

The flat Pending **grid view** (`/dashboard?unshipped&view=grid`, toggled by the **Board / Grid**
pills in the outbound header) is live and rendered by the new `LedgerGrid` primitive. Verified: filtered
`tsc` clean · 62 DS guards · unit `src/utils/dashboard-pending-layout.test.ts` · **e2e 6/6**
(`npx playwright test tests/e2e/to-ship-pending-grid.spec.ts --project=desktop`, dev server on :3000,
auth in `tests/.auth`). Board/Packed/Staged/Labels are untouched (additive).

**Files that own the grid view:**
- `src/design-system/components/grid/LedgerGrid.tsx` — generic scroll shell (scrollX, sticky docking, windowing). Dumb about columns/cells.
- `src/components/dashboard/orders-queue/OrdersGridView.tsx` — the orders wrapper (data-prep + renderRow + column header) composing `LedgerGrid`. **This is where grid-view-specific styling should be threaded.**
- `src/components/dashboard/orders-queue/OrdersQueueColumnHeader.tsx` — the sticky column header (SHARED with the board — see constraint below).
- `src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx` — the row (SHARED with the board). Has an additive `opaqueStripe` prop already.
- `src/lib/dashboard-order-row-layout.ts` — `ordersQueueGridCell()` (cell chrome + column rule), `ORDERS_QUEUE_COLUMNS` (column model with `type` glyphs), frozen helpers.
- `src/components/dashboard/orders-queue/column-type-glyph.tsx`? → actually `src/components/ui/table-column-config/column-type-glyph.tsx` (`ColumnTypeGlyph`, type→icon map).

## ⚠️ THE ONE CRITICAL CONSTRAINT

`OrdersQueueColumnHeader`, `OrdersQueueTableRow`, and `ordersQueueGridCell` are **shared with the
vertical shelf-board** (the default Pending view). **Do not globally restyle them** — a global "black
gridlines / white cells" change would wreck the board. Every visual change below must be **scoped to
the grid view**, via one of:
- a new **prop** (e.g. `variant="airtable"` / `gridSkin` / `blackGrid`) threaded
  `OrdersGridView → OrdersQueueColumnHeader` + `→ OrdersQueueTableRow`, **or**
- a **scoping class** on the `LedgerGrid` surface (it already has `data-cf-grid`; add e.g.
  `data-grid-skin="airtable"` and target descendants with a scoped stylesheet in `globals.css`, using
  semantic tokens — no page-local hex; if a black grid token doesn't exist, add one to the semantic
  color SoT `src/design-system/tokens/colors/semantic.ts`, don't inline `#000`).

Prefer the **prop** route for glyphs/select (behavioral) and the **scoping-class** route for the
border/background skin. Keep the DS ratchet guards green (`npm run test:*-guard`) — no raw hex, no
arbitrary spacing, `HoverTooltip` not `title=`, color from tokens only.

---

## The four fixes (screenshot feedback)

### 1. Header: **icon-first**
Today the header shows a type glyph **only on the flex columns** (Product/Notes) and label-first.
The user wants headers **icon-led** across the board.
- `OrdersQueueColumnHeader.tsx` → `HeaderCell`: `showGlyph = column.width.includes('fr')` gates the
  glyph. In the grid skin, show `ColumnTypeGlyph` on **every typed column** (Qty=number, Cond=tag,
  Age=date, Platform=tag, Order/Tracking=id already have `type` in `ORDERS_QUEUE_COLUMNS`), leading
  the label. Decide icon-first vs icon-only-with-`HoverTooltip` label — the user said "icon based
  first," so **icon then label** (or icon-only on the narrow fact columns where the label truncates to
  "Q…"/"TRAC…" anyway — those short labels are the ones that read badly in the screenshot).
- Watch the narrow columns: three columns share the `#` id/number glyph — if going icon-only there,
  disambiguate (e.g. distinct glyphs per type) or keep label. `ColumnTypeGlyph` is the one place to
  extend the type→icon map.

### 2. Header: **white**
The header band is `bg-surface-canvas/95 backdrop-blur-sm` (grey) — `OrdersQueueColumnHeader.tsx:~71`.
In the grid skin make it **white** (the white surface token — `bg-surface-card` is the house white;
confirm in `semantic.ts`). Keep it sticky + opaque (drop the translucency so nothing shows through on
vertical scroll).

### 3. Table body: **white cells + full BLACK grid**
The user wants the classic Airtable look: **white cell backgrounds** and a **complete black gridline
grid** (every cell bordered — verticals AND horizontals, including the outer frame).
- Gridlines: `ordersQueueGridCell()` in `dashboard-order-row-layout.ts` draws `border-r
  border-border-hairline` (light grey), last column + select gutter suppressed; rows draw `border-b
  border-border-hairline` (`OrdersQueueTableRow.tsx:~471`). In the grid skin, switch these to a **black
  grid token** and make it **full**: don't suppress the last-column/gutter rules, add the leading
  border + an outer frame so the grid closes on all sides. "Fully" = no open edges.
- Cells: **white**, and likely **drop the zebra** in the grid skin (the user said "white … fully", so a
  flat white grid rather than striped — confirm, but that's the read). The row already accepts
  `opaqueStripe`; the grid skin may instead force a flat white (`useAlternateStripe` → always white)
  and let the black grid carry the row separation.
- Day-band headers (`MON, JUL 20TH · 36`) should sit cleanly on white with the grid — check they don't
  double-border oddly against the full grid.

### 4. Row **selection checkbox** missing in the left gutter
The leftmost `select` column (2rem) is **empty** — the row-select checkbox never appears. Today
`OrdersQueueTableRow.tsx:~350` `leadControls` only renders a checkbox when `selectMode` is on
(the pencil); otherwise an empty `h-4 w-4` span. `OrdersGridView` passes `selectMode` from the board's
pencil, so with the pencil off there's nothing.
- Airtable shows a **hover-reveal row checkbox** in that left gutter always (not gated behind a
  separate "select mode"). In the grid skin, render a checkbox in the select gutter that is
  **visible on row hover** (and filled when checked), wired to the existing `useTableSelectMode`
  selection (`selectedIds` / `toggle`, already in `OrdersGridView`). The header select gutter should
  show the **select-all** checkbox to match (it currently shows only the drag grip).
- Keep the frozen-pane geometry: the select cell is the first frozen column
  (`ordersQueueFrozenLeft('select')`) — don't change its width/offset, just its contents/visibility.

---

## How to work + verify

```bash
# Dev server should already be running on :3000 (auth minted in tests/.auth).
# Drive the grid view and screenshot to the scratchpad as you iterate:
#   /dashboard?unshipped&view=grid   (grid — what you're styling)
#   /dashboard?unshipped             (board — MUST stay visually unchanged)

# Guards + types + e2e (the board regression tests catch any leakage into the shared components):
npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'error TS' | grep -v kiosk-intake-flow   # empty = clean
npx tsx --test $(find src -name '*.guard.test.ts')
npx playwright test tests/e2e/to-ship-pending-grid.spec.ts --project=desktop            # 6/6, incl. board regression
```

- **Prove no board regression:** the 4 board tests in that spec assert on `/dashboard?unshipped`; they
  must stay green — that's your guard that the shared restyle stayed scoped to the grid.
- Add/extend a grid-view visual assertion if practical (e.g. the grid body has the black-grid skin
  class; a cell's computed `border-*-color` is the dark token). Screenshot
  `test-results/to-ship-pending-grid-view.png` for a visual check.

## Don't
- Don't touch the board's look (shared components — scope everything).
- Don't inline hex or arbitrary spacing (DS guards will fail); add a token if a black grid colour is missing.
- Don't rebuild `LedgerGrid`/`OrdersGridView` — restyle within them.
- Don't remove `opaqueStripe`/frozen wiring — the frozen pane must keep working (e2e proves it).

## Context
Full Stage-1 rationale + Stage-2 plan (migrate consumers, delete `OrdersQueueTable`) lives in project
memory `pending-full-grid-stage-b` and `docs/todo/to-ship-pending-grid-stage-b-handoff.md`.
Kinetic Ledger / DS rules: `.claude/rules/ui-design-system.md`. This visual pass is a **grid-view skin**,
not a new design language.
