# Handoff — Pending **Grid**: industry-standard data-driven spreadsheet

> **Status: UPDATED 2026-07-21 — Phases 2–6 of
> `pending-grid-industry-standard-fable-prompt.md` LANDED + dogfood-verified (org 01).**
> Pending is **grid-only** (`OrdersGridView` / `LedgerGrid`, `/dashboard?unshipped`).
> North star = a real ops spreadsheet: Sheets in-cell editing, Airtable column
> reorder + locked primary field, Excel corner indicators, fixed brand-icon
> platform column, data-driven stock metrics.
>
> **Audience:** next coding agent. Do not re-introduce floating day bands,
> table-options / column-config / density chrome, drag-resize on Pending, or a
> swimlane board. Display order uses the TOP `QueueSortSwitch`
> (Priority | Newest | Deadline) via `?sort=`.

---

## Adopted standards (research digest 2026-07-21, applied)

- **Column reorder** — drag the whole header cell (Airtable/AG Grid); dnd-kit
  `PointerSensor { distance: 6 }` (house SwimlaneBoard recipe) + `KeyboardSensor`
  (Space lift · arrows · Space drop). `select · title` have AG-Grid
  `lockPosition` semantics (frozen AND immovable — Airtable primary-field
  precedent); order persists per staff; double-click a movable header = reset.
- **In-cell editing (Sheets/Excel/APG consensus)** — navigate vs edit modes:
  click/Enter/F2 start (content preserved), typing a printable char starts +
  replaces, Enter commits, Esc reverts, Tab commits + moves on, **blur/outside
  click commits — a draft is never silently dropped**. Editors commit on
  unmount (virtualization can't eat a draft; StrictMode-safe scheduled commit).
- **Click-to-edit vs click-to-open (Airtable split)** — editable cells
  select→edit on click; the Product cell carries explicit hover affordances
  (Maximize2 = open pane, Link2 = edit listing link); non-editable cells
  (age/order/tracking/stock) keep row-click-opens. Left-gutter selection is
  always-on and independent.
- **Corner indicators (Excel/Sheets/Equals)** — note = slate triangle top-right
  of the Product cell, OOS = rose triangle top-left; hover/focus = exact text;
  click (or **Shift+F2**) = editor anchored AT the indicator itself (the
  Sheets note-bubble position — note editor opens right-aligned under the
  top-right triangle, OOS under the top-left; title-cell corner fallback when
  adding a first note). Both live on the FROZEN cell so they survive h-scroll.
  Sparse facts never earn a column.
- **Pill-as-trigger enum editing (Airtable/Canva)** — the condition cell is a
  soft SoT-toned pill (`conditionGradeTone(...).badge`) + caret with pure
  select semantics (NO copy action — the CopyChip variant was deliberately not
  used); listbox over `conditionOptions()` SoT; empty cells show a quiet `— ⌄`
  set-affordance. Track sized 5.5rem for the widest pill (`PARTS` + caret).
- **Platform marks** — the column shows a fixed-footprint monochrome brand
  icon (`PlatformMark` + `platform-brand-icons.ts`), tinted by each platform's
  tone. No scraped favicons — Simple Icons CC0 paths where available, Cycle
  Forge ops silhouettes for Amazon / FBA / Goodwill / ECWID-RS / Other.
  Lettermark remains the only fallback. sr-only + tooltip always carry the
  label. **Bare channel mark**: no sunken/rounded app-tile wrapper — every
  mark centers in a transparent `h-5 w-5` footprint with a `h-4` icon.
- **Width pressure (2026-07-22)** — content-hard `minmax(X,X)` fact tracks;
  title `minmax(12rem, 1fr)`; shared `--cf-orders-grid-w: max(100%, <min>rem)`
  on LedgerGrid so every virtualized row locks the same track widths (never
  per-row `w-max`, which drifted columns under long Product titles). Adaptive
  headers: glyph-only below `labelFitRem`, short `gridLabel` when it fits
  (never truncated `A…`). Viewport priority collapse By → Qty → Ch.
  (ephemeral; Age/Cond/Order/Tracking-glyph always stay). CopyChip `quiet` face reverted
  (`plain` = icon-off only). Frozen `select · Product` sticky pane unchanged.
- **Backorder as metrics** — `replenishment_*` facts resolve via the
  `replenishment-display.ts` registry and surface ONLY in the OOS
  corner-indicator tooltip (the dedicated `stock` column was retired
  2026-07-22 — see the minimal-simplify pass below). The free-text
  `out_of_stock` reason stays on the OOS indicator. No fake numbers; no
  stock-on-hand join (still ask-first).
- **Table baseline** — qty right-aligned tabular; one subtle rule color;
  truncate + `HoverTooltip` everywhere; row height never changes (selection AND
  editing are background/ring only).

## Column scan order (canonical — `ORDERS_QUEUE_COLUMNS` is the SoT)

`select · Product · Ship by (date) · Age · Status · Qty · Cond · Platform · Order · Tracking`

- `title` is the ONLY flex track. The old **`notes` column is deleted**, and the
  **`stock` column was retired 2026-07-22** (replenishment facts live only in
  the OOS corner-indicator tooltip); fact tracks are content-hard
  `minmax(X,X)` (platform `3rem` equal tile); `condition` is `5.5rem` (pill +
  caret). Adaptive `gridLabel` / glyph-only via `labelFitRem`; viewport
  force-hides `date` → `qty` → `platform` under width pressure.
- **Status column (2026-07-22)** — Pending / Tested / Out of stock chips from
  `FULFILLMENT_STATE_META`; `?sort=status`; Product title-dot dropped on
  `gridSkin`. Rows without a tracking number are **filtered out** of Pending
  (Labels owns untracked). Grid is **full-bleed** (no card shell); page scroll
  via `DashboardScrollShell` + `LedgerGrid` `scrollParentRef` so KPI scrolls
  away and the column header sticks under pinned chrome.
- Per-staff drag order persists in
  `staff_preferences.tableColumns['orders'].order` (schema + Zod extended);
  `sanitizeOrdersQueueColumnOrder()` re-fronts locked keys, drops retired keys
  (`notes`, `stock`), and inserts new SoT columns at their canonical slot.

## Minimal-simplify pass (2026-07-22, landed)

- **Stock column removed** — `OrdersQueueColumnKey`/`ORDERS_QUEUE_COLUMNS` no
  longer carry `stock`; the sanitizer drops persisted keys;
  `replenishmentStatusMeta` is internal to `replenishment-display.ts` (tooltip
  only). Unit + both e2e specs updated.
- **Platform = listing-link cell** — grid rows/folds with **no listing link
  show a faint `—`** instead of a dead (unclickable) favicon; FBA keeps its
  channel mark by design.
- **Tracking empty** — Pending **filters out** rows with no tracking number
  (Labels owns untracked). Defensive `+` jump remains in the tracking cell for
  other surfaces / edge cases; Pending e2e asserts zero `data-add-label`.
- **Qty type scale** — qty numerals match the Date/Age cells
  (`densityClasses.metaText` inherit, no more `text-role-eyebrow`/mono); group
  summary qty uses `text-role-caption`.
- **Platform favicons refreshed** — `public/icons/platforms/ebay.png` is now
  the eBay four-color shopping-bag mark (from eBay's developer-program
  branding, 64px); `amazon.png` is the "a + smile" icon (Wikimedia
  `Amazon_icon.png`, 64px). `fba.png` keeps the old orange smile tile.
- **Status column — LANDED 2026-07-22** — see
  `pending-grid-status-column-plan.md` (fulfillment-only Pending/Tested/Out of
  stock; page-scroll sticky; full-bleed).
- **Next up: dead-code cleanup** — **DONE (2026-07-22 LedgerGrid SoT pass):**
  unreachable `price`/`staff` sort branches + `staffSortKey`/`saleAmountValue`
  removed; replenishment display shrunk to label + tooltip (no short/chip).
  `PendingOrdersTable` was already gone. Knip baseline held (no growth).
- **LedgerGrid DS SoT** — `VirtualGroupedSections` hoisted to
  `src/design-system/components/grid/`; `LedgerGrid` gained optional day bands /
  `daySections`. Receiving browse, StationListTable (virtualized), RepairTable,
  and FbaBoardTable compose it; Unbox `accordionBootstrap` / Expand-all wired
  through `PoLinesAccordion` (inactive fake chevrons removed).
- **Sort chrome** — `QueueSortSwitch` is now a quiet trailing dropdown
  (ArrowUpDown + value + caret) in the CTA cluster left of Import, on Pending
  and Testing (rule: `.cursor/rules/workbench-sort-chrome.mdc`).
- **Selection bar overflow fixed** — `MobileSelectionBar`'s capsule is
  `mx-auto w-full max-w-fit` (compact, centered) instead of viewport-wide.
- **Single-selected row info menu** — exactly one checked row shows a chevron
  on the Product cell (layout-stable slot) opening `RowInfoMenuPopover`:
  **Notes · Out of stock · Details**, wired to the existing cell editors /
  `?openOrderId=` open.
- **Condition color coding** — marketplace strings resolve through
  `resolveConditionGrade()` aliases (`NEW`→BRAND_NEW, `L-NEW`→LIKE_NEW, `A/B/C`,
  …) in `conditions.ts`, so pills + the listbox current-option render their SoT
  grade tone (`conditionGradeTone().badge`); bare `USED` deliberately keeps the
  neutral fallback (it names no grade).

## Architecture (what changed)

- **Cell-renderer registry** — `OrdersQueueTableRow`, `OrderGroupSummary`, and
  `OrdersQueueColumnHeader` all map over ONE ordered `columns` list
  (`orderedOrdersQueueColumns(order)`); reorder is a list change, never a CSS
  trick. Cells stay DIRECT grid children (React `Fragment` keying — the
  airtable skin's `> *` border rules depend on it).
- **One editor shell** — `LedgerCellEditor`
  (`src/design-system/components/grid/`) for in-cell text/number;
  `cell-editors.tsx` (orders-queue) hosts the cell-anchored popovers
  (`CellTextEditPopover` note/OOS/listing-link · `ConditionSelectPopover` ·
  `ShipByDatePopover` on the house `Popover`/`AnchoredLayer` + `Calendar`,
  civil-date round-trip via `dateKeyToLocalDate`/`localDateToDateKey`).
- **One mutation waist** — every editor commits through `useOrderAssignment`
  (`/api/orders/assign`); the route + payload + optimistic patch grew
  `productTitle`. Listing link = **`item_number`** (URL derives via
  `getExternalUrlByItemNumber`); a stored URL column stays ask-first.
- **Platform SoT growth** — `SourcePlatformMeta.icon` + `PlatformMark` renders
  vendored icon or lettermark; `order-platform.ts` tones now converge on
  `sourcePlatformMetaFromLabel` (fork retired; zoho/mercari keep local extras).
- **focusRing grew a `cell` archetype** (inset focus-visible ring — offset
  rings clip in grid cells).
- Retired: `RowInlineEditBubble`, `RowFieldPreview` (Pending was the last
  consumer). Board/Packed/station rows keep display-only cells but INHERIT the
  corner indicators (they replaced the notes column for every consumer) and the
  fixed platform mark. Packed keeps drag-resize + label-first headers (glyphs
  only on fr columns — skin-scoping guardrail).

## Key files

- Column SoT + sanitizer: `src/lib/dashboard-order-row-layout.ts` (+ `.test.ts`)
- Grid shell / editor: `src/design-system/components/grid/{LedgerGrid,LedgerCellEditor}.tsx`
- Pending wrapper + order prefs: `OrdersGridView.tsx`, `useColumnOrder.ts`
  (`table-column-config/`), `src/lib/schemas/staff-preferences.ts`
- Header DnD / row registry / summary: `OrdersQueueColumnHeader.tsx`,
  `OrdersQueueTableRow.tsx`, `OrderGroupSummary.tsx`, `cell-editors.tsx`
- Platform icons: `src/lib/platform-brand-icons.ts`, `src/lib/source-platform.ts`,
  `src/components/ui/PlatformMark.tsx`, `OrderIdentityChips.tsx`
  (`useOrderIdentityCellNodes`)
- Stock registry: `src/lib/orders/replenishment-display.ts`
- E2E: `tests/e2e/to-ship-pending-grid.spec.ts` (reorder persistence, platform
  mark, qty in-cell round-trip, frozen pane, gridlines),
  `tests/e2e/orders-queue-skin-scoping.spec.ts` (Packed stays gray)

## Dogfood org-01 matrix (2026-07-21, run on live dev :3000, staff Michael)

| # | Scenario | Result |
|---|---|---|
| 1 | Load Pending grid | ✅ spreadsheet shell, sticky header, frozen select·title, no day bands |
| 2 | Reorder columns (Platform before Cond) | ✅ live; header+body agree; select/title immovable (e2e) |
| 3 | Reload | ✅ order persisted per staff (e2e) |
| 4 | Reset order | ✅ double-click movable header → canonical + toast (e2e) |
| 5 | Platform column | ✅ fixed mark (icon/lettermark), tooltip+sr-only label, 3rem track |
| 6 | Note corner indicator | ✅ slate top-right on frozen Product cell; exact text on hover; click + Shift+F2 open editor; commit/revert round-trip on order 5436 |
| 7 | Condition chip dropdown | ✅ SoT listbox (NEW…PARTS + Clear), focus on current, USED→A→USED round-trip |
| 8 | Ship-by in-cell | ✅ calendar anchored to cell, current day selected, civil-key commit, Age consistent |
| 9 | Qty in-cell | ✅ 1→2 commit, **persisted across reload**, revert; right-aligned; Esc reverts |
| 10 | Title edit | ✅ in-place editor with full value; commit + revert (new `productTitle` waist) |
| 11 | Listing link from Title | ✅ Link2 hover affordance → item# editor + derived-URL hint |
| 12 | Listing link from Platform | ✅ hover-menu entry (same SoT editor); mark click opens listing |
| 13 | OOS indicator + stock | ✅ rose top-left triangle + exact reason on order 5436 (set→verify→clear via editor). Stock chip: no Pending row currently carries `replenishment_*` facts → quiet-empty verified across 104 rows; chip covered by registry + code (no fake data) |
| 14 | Sort switcher | ✅ Priority↔Newest reorders and restores |
| 15 | Open row detail | ✅ non-editable cell click + expand affordance → `?openOrderId=` without fighting editors |
| 16 | Select-all / multi | ✅ 28 rendered rows checked, action bar up, clear works |
| 17 | H-scroll after reorder | ✅ frozen pane pins <3px drift (e2e) |
| 18 | Empty search state | ✅ by inspection — search plumbing untouched (`isSearching → OrderSearchEmptyState`) |
| 19 | Narrow viewport | ✅ h-overflow scrolls under frozen pane (forced-overflow check); desktop is SoT |
| 20 | Truncation | ✅ long titles ellipsize + tooltip; row heights constant (41/43px leaf/fold, never state-driven) |
| 21 | Indicators while h-scrolled | ✅ triangles ride the frozen Product cell; `cf-grid-scrolled` shadow engages |
| 22 | `npm run verify` | ✅ PASSED (lint, typecheck, unit+DS guards, knip, route drift, schema); e2e 10/10 |

Screenshots: `test-results/to-ship-pending-grid*.png`,
`test-results/pending-grid-matrix-{qty-editor,condition-listbox,note-editor}.png`.

Known nuances:
- Dev StrictMode double-effects required the editors' commit-on-unmount to be a
  *scheduled* commit (cancelled by the synchronous remount) — keep that pattern
  for any future commit-on-unmount editor.
- E2E determinism: the reorder spec must AWAIT the background staff-prefs PUT
  before reloading (navigation aborts in-flight fetches), self-heal a stale
  persisted order via double-click reset at test start, and the qty round-trip
  must pick a target value that DIFFERS from the current one (a no-change draft
  never POSTs).

## Compound opportunities

- **Do now (done in this change):** `order-platform.ts` tone fork converged on
  the source-platform SoT; `focusRing('cell')` archetype; `Popover` grew
  `closeOnEscape`; `ConditionGradeChip` grew `onActivate` (chip-as-trigger).
- **Promote to DS next (2+ call sites):** `useColumnOrder` + header-drag recipe
  → generalize for Packed/receiving tables when they want reorder;
  `LedgerCellEditor` popover siblings (`CellTextEditPopover`) → DS grid family
  once a second grid adopts in-cell editing; corner-indicator primitive
  (triangle + tooltip + editor) if a second surface needs sparse-fact markers.
- **Deferred (ask first):** stored listing-URL column/route; stock-on-hand
  (available-qty) join onto `/api/orders` for need-vs-available;
  `replenishment_requests.created_at` in the ranked CTE for an
  age-of-exception metric; full APG 2-D arrow-key grid navigation.

## Verify

- `npm run verify`
- `npx playwright test tests/e2e/to-ship-pending-grid.spec.ts tests/e2e/orders-queue-skin-scoping.spec.ts --project=desktop`
- Unit: `npx tsx --test src/lib/dashboard-order-row-layout.test.ts`
