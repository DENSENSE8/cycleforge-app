# Handoff — Pending **Grid view**: simplify to a MINIMAL (Linear/Notion) table

> **Status: DONE (2026-07-21).** Skin gutted to light horizontal row dividers,
> label-only headers, hover-reveal select. Board scoping e2e green. Keep this
> file as the north-star / regression note — do not re-introduce the black cage.
>
> **Audience:** next coding agent. **Scope:** the Pending → **Grid view**
> (`/dashboard?unshipped&view=grid`) currently renders a heavy **black full-grid**
> (a border on every side of every cell) with **icon-first headers that truncate**
> (`# Q`, `⏱ A…`, `# TR…`). The user's verdict: *"this is terrible."* Strip it back
> to a calm **Linear/Notion** table. This is a **visual simplification** — mostly
> *deleting* the grid CSS I over-built, not adding. **Do NOT re-architect** the
> plumbing (`LedgerGrid` / `OrdersGridView` / frozen pane / resize / virtualization
> are all correct and e2e-green) and **do NOT touch the board** (§ THE CONSTRAINT).

---

## 0. The target (locked with the user — this is the north star)

```
  Product          Qty  Cond  Age   Notes        Platform  Order  Track
 ──────────────────────────────────────────────────────────────────────
  Bose Wave III      1   USED  42d   trade-in…    ebay      8101   8308
 ──────────────────────────────────────────────────────────────────────
  Replacement 2.75   1   USED  34d   REPLACE…     amazon    0650   8104
 ──────────────────────────────────────────────────────────────────────
```

- **White background.**
- **Light-gray HORIZONTAL row dividers only.** **No vertical column rules. No outer frame/cage.**
- **Clean text labels in the header. NO per-column glyphs** (the icon-first pass is what produced `# Q` / `A…` / `TR…`; remove it).
- **Row hover tint** (subtle).
- **Row-select checkbox reveals on hover** in the left gutter (filled when checked); a header select-all appears on header hover.
- White, quiet header with a single light divider under it.

**Why this pass exists (read this so you don't repeat the miss):** the previous
handoff said "full **black** grid," and it was implemented literally — a border on
all four sides of every cell in `border-strong` (#0f172a). It reads as an
oppressive cage. The lesson: aim at the **reference** (Linear/Notion restraint),
not a literal color. When in doubt, **remove a line**, don't darken one.

---

## 1. Where things stand (what's built + the exact levers)

The grid skin is **opt-in and fully scoped** to the grid view via
`data-grid-skin="airtable"` on the `LedgerGrid` scroll surface. Two layers:

- **A scoped stylesheet** in [`src/styles/globals.css`](../../src/styles/globals.css) — search
  for the comment `── Airtable grid skin` (right after the `.cf-grid-scrolled` rule).
  **This block is where the heavy black grid lives. Most of your work is deleting
  from it.** It currently:
  - defines `--cf-grid-line: var(--ds-color-border-strong)` (the black),
  - draws `border-right` + `border-bottom` on **every** cell (`[role='row'] > *`,
    `[data-order-row-id] > *`, `[data-grid-summary-row] > *`),
  - adds a left frame (first cell `border-left`) + top frame (header `border-top`),
  - zeroes the containers' own `border-bottom-width`,
  - makes the header opaque white + `backdrop-filter: none`,
  - whitens the day bands.
- **A `gridSkin` prop** threaded `OrdersGridView → OrdersQueueColumnHeader`
  (icon-first + select-all) and `→ OrdersQueueTableRow` (flat-white bg + gutter
  checkbox). Board consumers never pass it, so the board is untouched by default.

**Files that own the grid view:**
- `src/styles/globals.css` — the `[data-grid-skin='airtable']` block (**the skin CSS — gut it**).
- `src/components/dashboard/orders-queue/OrdersQueueColumnHeader.tsx` — `gridSkin` → glyph gating (`showGlyph`) + select-all. SHARED with the board.
- `src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx` — `gridSkin` → `leadControls` checkbox + row bg. SHARED with the board.
- `src/components/dashboard/orders-queue/OrdersGridView.tsx` — the grid wrapper; passes `gridSkin`, owns selection wiring.
- `src/design-system/components/grid/LedgerGrid.tsx` — stamps `data-grid-skin` (leave as-is).
- `src/design-system/themes/light.ts` — token values: `border-hairline #f1f5f9` (gray-100), `border-subtle` (gray-200), `border-default #cbd5e1` (gray-300), `border-strong #0f172a` (the black to drop).

## ⚠️ THE ONE CRITICAL CONSTRAINT (unchanged from the last pass)

`OrdersQueueColumnHeader`, `OrdersQueueTableRow`, and `ordersQueueGridCell` are
**shared with the vertical shelf-board / flat `OrdersQueueTable`** (Pending board,
Packed, Shipped, Shipping, Pack). **Every change stays scoped to the grid skin** —
via the `[data-grid-skin='airtable']` stylesheet or behind the `gridSkin` prop.
The board must stay **gray-header + hairline + label-first**, byte-identical.
There is a guard for exactly this (§ Verify) — keep it green.

---

## 2. The changes (mostly deletion)

### 2a. Gridlines → one light horizontal row divider, nothing else (CSS)
In the `[data-grid-skin='airtable']` block in `globals.css`:
- **Delete** every per-cell border rule: the `> *` `border-right`/`border-bottom`,
  the first-cell `border-left`, the header `> *` `border-top`, and the
  `border-bottom-width: 0` container overrides. All of it — that's the cage.
- **Recolor `--cf-grid-line` to a light token**: start with
  `var(--ds-color-border-subtle)` (≈ gray-200 — the Linear row-line weight). If it
  still reads a touch heavy, drop to `var(--ds-color-border-hairline)` (gray-100).
  **Never** `border-strong`/`border-default` for this — those are the "too heavy" end.
- Keep **only**: the white header (`[role='row']` → `background-color:
  var(--ds-color-background-surface); backdrop-filter: none;`), a single
  `border-bottom: 1px solid var(--cf-grid-line)` under the **rows**
  (`[data-order-row-id]`, `[data-grid-summary-row]`) and the header, and the white
  day band with the same light `border-bottom`. The block should end up ~4 short rules.

  *(The row already carries a base `border-b`; you're just recoloring it light and
  removing the verticals/frame — the horizontal divider is the whole grid now.)*

### 2b. Header → clean labels, zero glyphs
`OrdersQueueColumnHeader.tsx → HeaderCell`: today `showGlyph = gridSkin ?
Boolean(column.type) : column.width.includes('fr')`. In the skin, **turn glyphs
off entirely** — `showGlyph = gridSkin ? false : column.width.includes('fr')`.
Labels only; the narrow columns get their full width back (`Qty`, `Cond`, `Age`,
`Order`, `Track…`) instead of `# Q` / `A…`. (The board branch is unchanged.)

### 2c. Checkbox → hover-reveal in the gutter
The Pending view is **`alwaysSelect`** (`useDashboardBulkSelection`: `selectMode`
is always true for `unshipped` — "the header select-all owns To Ship selection"),
so today `leadControls` renders the always-visible pencil `<span>`, not the
hover-reveal `<button>`. For the minimal look, in `OrdersQueueTableRow.tsx`
**reorder `leadControls` so the `gridSkin` hover-reveal checkbox wins even when
`selectMode` is true**: `gridSkin ? <hover-reveal button> : selectMode ? <span> :
<empty>`. The hover button is `opacity-0 group-hover/row:opacity-100` (+ `opacity-100`
when `isChecked`), `stopPropagation`, and calls the existing `onToggleSelect`.
Row-body click still toggles selection (that's `alwaysSelect`, consistent with the
board — do **not** change it). Mirror it in the header: make the select-all
hover-reveal too (`OrdersQueueColumnHeader`).

### 2d. Row hover tint
Already present (`hover:bg-surface-hover` on the row) — just confirm it survives.
The flat-white `gridSkin` bg is already correct; keep it.

### Leave alone
Frozen identity pane + `.cf-grid-scrolled` scroll shadow (`[data-frozen-edge]`),
`LedgerGrid`, resize handles, virtualization, the `gridSkin="airtable"` wiring.
No verticals doesn't mean no frozen pane — the scroll shadow still marks the edge
(e2e test 4 proves the pane; keep it green).

---

## 3. Guards to UPDATE (important — one encodes the old design)

`tests/e2e/orders-queue-skin-scoping.spec.ts` (added last pass) has a **grid** test
that asserts the *old* look and **will fail** after this pass:
- it expects the grid cell gridline to be **black** (`15,23,42`) and the qty/order
  headers to **have glyphs**. Re-baseline that test to the minimal design:
  - grid header still **white** + `backdrop-filter: none` (keep),
  - narrow headers now have **0 glyphs** (`glyphCount(header,'qty') === 0`),
  - a body cell has **no vertical rule** (`border-right-width === '0px'`) and the
    **row** carries a light `border-bottom` (assert its color ≈ the light token, not `15,23,42`).
- **Keep the board tests (1 & 3) exactly as-is** — they prove the board stays gray /
  hairline / label-first, which is still true and is the whole point of scoping.

`tests/e2e/to-ship-pending-grid.spec.ts` — its grid-view tests (frozen pane,
Board↔Grid toggle, resize) are structural and should still pass untouched. Its
gridline/glyph assertions run on the **board** (`?unshipped`), which is unchanged.

---

## 4. How to work + verify

```bash
# Dev server on :3000 (auth in tests/.auth). Drive + screenshot as you iterate:
#   /dashboard?unshipped&view=grid   (grid — what you're simplifying)
#   /dashboard?unshipped             (board — MUST stay gray/hairline, unchanged)

npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'error TS' | grep -v kiosk-intake-flow   # empty = clean
npx tsx --test $(find src -name '*.guard.test.ts')                                      # DS ratchets
npx playwright test tests/e2e/to-ship-pending-grid.spec.ts --project=desktop            # 6/6 (board regression)
npx playwright test tests/e2e/orders-queue-skin-scoping.spec.ts --project=desktop       # after you re-baseline test 2
```

- **Prove no board regression:** the board assertions in both specs must stay green
  — that's your proof the simplification stayed inside the grid skin.
- Screenshot the grid at `deviceScaleFactor: 2` and eyeball against § 0. It should
  read like the mock: airy, white, one quiet row line, no verticals, no glyphs.
- `npm run verify` before calling it done (lint + typecheck + guards + knip + route-auth).

## 5. Don't
- Don't touch the board's look (shared components — scope everything to the skin).
- Don't inline hex / arbitrary spacing (DS guards fail); the line color is a **token**
  (`--cf-grid-line` → a light `--ds-color-*`), never `#e5e5e5`.
- Don't add vertical column rules or an outer frame "for structure" — the user
  explicitly wants row lines only. Restraint is the feature.
- Don't rebuild `LedgerGrid`/`OrdersGridView` or rip out the frozen/resize wiring.
- Don't change the row-click-toggles behavior (it's `alwaysSelect`, shared with the board).

## Context
Prior pass (what you're softening): `docs/todo/pending-grid-airtable-visual-handoff.md`
+ project memory `pending-full-grid-stage-b`. House DS law: `.claude/rules/ui-design-system.md`
(Kinetic Ledger — "legible throughput, calm chrome"; a quiet Linear row-line table
*is* that, the black cage was not). This is a grid-view **skin refinement**, not a
new design language, and not a board change.
