# Prompt — Claude Code · Fable 5

**Copy everything below the line into Claude Code (Fable 5).**  
Repo: `cycleforge-app` · surface: Pending / To Ship grid · dogfood tenant: **org 01**.

---

You are Claude Code (Fable 5) working in the Cycle Forge monorepo (`cycleforge-app`).

## Mission

Bring the **Pending / To Ship spreadsheet** (`/dashboard?unshipped` → `OrdersGridView` / `LedgerGrid`) to **100% industry-standard ops data-grid UX** (Google Sheets + Airtable + modern SaaS ledger grids), then **prove it on dogfood org 01** with a real testing order.

This is an **implementation + research + dogfood verification** task — not a design essay.

---

## Non-negotiables (read first)

1. **Read and obey** `AGENTS.md`, `.claude/rules/ui-design-system.md`, `.claude/rules/source-of-truth.md`, and the improve-ui skill if you touch polish.
2. **Kinetic Ledger** only — compose / grow SoT; never invent a second visual language or page-local hex.
3. **Dates** only via `src/utils/date.ts`. **Conditions** via `src/lib/conditions.ts` + `src/lib/condition-tone.ts`. **Platform identity** via `src/lib/source-platform.ts` (grow it; don’t fork labels).
4. Pending is **grid-only** — do **not** revive Board|Grid switcher, floating day bands, swimlane DnD, density chrome, or the old TableOptions ⋯ menu.
5. **Select column is frozen left and never reorderable.** All other columns must be user-reorderable.
6. Before coding display patterns: adopt the **pre-gathered research digest** in Phase 0 (2026-07-21, cited) — verify/extend with web search only where you deviate or a pattern is uncovered. Cite the patterns you adopt in the handoff notes.
7. Before claiming done: `npm run verify` green + **extensive live dogfood testing** (org 01) on a testing order (steps below).
8. Do **not** commit unless the user asks. Append a work-log entry when a unit lands (`pnpm worklog "…" --result …`).
9. Prefer growing existing primitives (`LedgerGrid`, `ORDERS_QUEUE_COLUMNS`, `useOrderAssignment`, `staff_preferences.tableColumns`, `PlatformMark` / `source-platform`) over new parallel systems.

### Prior art / current state (do not regress)

- Handoff: `docs/todo/pending-grid-minimal-simplify-handoff.md`
- Grid: `OrdersGridView` + `LedgerGrid` (`gridSkin="airtable"`), sticky icon-only header, frozen `select · title`, Date = ship-by, Age = relative SLA, `QueueSortSwitch` (`?sort=`).
- **Recently removed** from Pending: TableOptions ⋯, column-config hide UI, density provider, drag-**resize**. Do **not** bring density / hide-columns / resize back unless a researched industry pattern *requires* them for reorder+inline-edit to work — and if so, ask first for hide/density/resize; **column order is explicitly in scope**.
- Notes/OOS today use a **Notion-style bubble** (`RowInlineEditBubble`) — **Notes/OOS demote to corner indicators on the Product cell (Phase 4b)**; the remaining fields get Sheets-style in-cell edit (Phase 4).
- Platform today often renders **variable-width text names** (or lettermarks). Replace with **fixed-size downloaded brand icons**.
- OOS today is a free-text exception flag co-located in Notes. Replace with **data-driven OOS metrics display**.

### Key files

| Concern | Path |
|---|---|
| Column SoT | `src/lib/dashboard-order-row-layout.ts` |
| Grid shell | `src/design-system/components/grid/LedgerGrid.tsx` |
| Pending wrapper | `src/components/dashboard/orders-queue/OrdersGridView.tsx` |
| Header / row | `OrdersQueueColumnHeader.tsx`, `OrdersQueueTableRow.tsx` |
| Platform chips / listing | `src/components/ui/OrderIdentityChips.tsx`, `src/utils/order-platform.ts` |
| Platform SoT | `src/lib/source-platform.ts`, `src/components/ui/PlatformMark.tsx` |
| Mutations | `src/hooks/useOrderAssignment.ts` (already supports `notes`, `condition`, `quantity`, `shipByDate`, `outOfStock`, …) |
| Staff prefs | `src/lib/neon/staff-preferences-queries.ts` → `tableColumns[tableId]` (`hidden` / `widths` today — **extend with `order`**) |
| Orders API (replenishment already joined) | `src/app/api/orders/route.ts` (`replenishment_*`, `out_of_stock`) |
| E2E | `tests/e2e/to-ship-pending-grid.spec.ts`, `tests/e2e/orders-queue-skin-scoping.spec.ts` |

Default column scan order today:

`select · title · date · age · qty · condition · notes · platform · order · tracking`

> ⚠️ The minimal-simplify handoff states `… Date · Qty · Cond · Age …` — that doc is **stale** on
> order; `ORDERS_QUEUE_COLUMNS` (code) is the SoT and puts Age before Qty as above. Fix the handoff
> when you update it.

### Target end-state column plan — purposeful cells (2026-07-21 update)

Every cell must be **small, purposeful, data-driven** — no column spends width on a fact that is
usually empty or rarely scanned. Target canonical order after Phases 2–5:

`select · title · date · age · qty · condition · stock · platform · order · tracking`

| Column | Track | Target display |
|---|---|---|
| `select` | `2rem` (locked) | checkbox only |
| `title` | the **only** flex track | truncated single line + status dot + **corner indicators** (note top-right · OOS top-left, Phase 4b) + hover expand affordance |
| `date` | `4.5rem` | compact civil `Jun 9` |
| `age` | `3.25rem` | relative SLA tone |
| `qty` | `3rem` | right-aligned tabular number |
| `condition` | `~4rem` fixed | `ConditionGradeChip` — the chip **is** the dropdown trigger (Phase 4) |
| `stock` | fixed narrow (funded by deleting `notes`) | replenishment shortfall/status chip; quiet-empty when in stock (Phase 5) |
| `platform` | shrink `5.5rem → ~3rem` | fixed brand icon only (Phase 3) |
| `order` / `tracking` | unchanged | typed chips |

- **The `notes` flex column is deleted.** Note presence becomes a corner indicator on the Product
  cell (Phase 4b); its freed width funds the fixed `stock` metrics track — net column count stays
  flat and `title` gains scan room.
- Long text never wraps and never grows the row: truncate + `HoverTooltip` full value.
- Fallout to handle in the same change: `to-ship-pending-grid.spec.ts` asserts a `notes` cell and its
  border today — update those assertions; the Phase-2 order sanitizer must silently drop persisted
  `notes` keys; `TABLE_COLUMNS.orders` hide-keys and `useIsColumnHidden('rest')` gating get a pass.

---

## Codebase grounding — verified facts (2026-07-21, file:line audited)

Everything below was read from source. Build on these; re-verify only if the file changed since.

### Grid mechanics

- **The grid template is built per-row, not by `LedgerGrid`.** `ordersQueueGridTemplate()`
  (`src/lib/dashboard-order-row-layout.ts:102`) returns
  `ORDERS_QUEUE_COLUMNS.map(c => var(--cf-col-${key}, ${width})).join(' ')`; header, every body row,
  and every group summary each set their own `gridTemplateColumns` from it. `LedgerGrid` only owns the
  scroll surface, sticky header wrapper, `--cf-grid-header-h` publishing, and the
  `cf-grid-scrolled` / `cf-grid-scrolled-y` shadow classes.
- **Frozen pane = per-cell `position: sticky`**, driven by `ORDERS_QUEUE_FROZEN_KEYS = ['select','title']`
  + `ordersQueueFrozenLeft(key)` (sums the CSS vars of *preceding* frozen columns) +
  `ORDERS_QUEUE_FROZEN_CELL = 'sticky z-raised bg-inherit'`. Zebra stripes must stay **opaque** or
  frozen cells bleed. Frozen-edge shadow rides `data-frozen-edge` (on the title cell) + the scroll class.
- **Airtable skin CSS is scoped in `src/styles/globals.css` (~533–602)** — `[data-grid-skin='airtable']`
  sets `--cf-grid-line`, zero row px, per-cell `border-right`/`border-bottom`, opaque white header.
- **Cells render in fixed JSX order** in `OrdersQueueTableRow`, `OrderGroupSummary`, and
  `OrdersQueueColumnHeader` (`DATA_COLUMNS` = columns minus `select`). **Column reorder is therefore a
  render refactor, not a CSS trick**: introduce a cell-renderer registry keyed by
  `OrdersQueueColumnKey` and map header + row + summary over one ordered column list.
- **Virtualization**: `VirtualGroupedSections` uses `@tanstack/react-virtual` (overscan 10, row
  estimate 44). Rows **unmount** outside the overscan window ⇒ any open in-cell editor whose draft
  state lives inside the row dies on scroll. Hoist edit state (keyed `orderId+field`) into the grid
  controller, or the editor must commit on unmount.

### Mutation waist

- `useOrderAssignment` → `POST /api/orders/assign`. `OrderAssignPayload` **already accepts**
  `notes, condition, quantity, shipByDate, outOfStock, shippingTrackingNumber, itemNumber, isUrgent,
  testerId/packerId, sku, skuCatalogId` (`src/hooks/useOrderAssignment.ts:6–27`). Optimistic patch
  covers query keys `['orders']`, `['shipped']`, `['dashboard-table']`, patches snake+camel aliases,
  rolls back on error, **no refetch on success**, and dispatches `order-assignment-updated`. Every
  Phase-4 editor commits through this one waist — no new mutation hooks.
- Open check: confirm the `/api/orders/assign` handler wires `shipByDate` into the same
  deadline/`work_assignments` side the current ship-by writer uses (payload accepts it; route side
  unverified).

### Listing URL — resolved (this answers Phase 4's "find the real field/API")

- `productPageUrl` is **derived, not stored**: `getExternalUrlByItemNumber(item_number)`
  (`src/utils/external-item-url.ts:15–22`) — `B0…` → amazon.com/dp, 12-digit → ebay.com/itm, else
  usavshop search. There is **no `product_page_url` column on orders and no orders API to edit a URL**.
- ⇒ "Edit listing link" = **edit `item_number`** — `POST /api/orders/set-item-number` exists, and
  `itemNumber` is already in the assign payload. One editor, two entry points (Title + Platform).
- A true stored listing-URL column/route is **ask-first** (schema change). `listing_url` exists only
  on `receiving_lines` (`PUT /api/receiving/[id]`) — different domain, do **not** reuse it.

### Column-order persistence substrate

- `staff_preferences.tableColumns[tableId] = { hidden?: string[], widths?: Record<string,number> }` —
  **no `order` key exists yet**. The upsert is a shallow JSONB merge at the `tableColumns` key, so any
  write must carry the whole map and preserve siblings exactly like `useColumnWidths` does
  (`{ ...prev.tableColumns?.[tableId], widths: next }` pattern). Mirror `BoardPrefs.order?: string[]`
  (lane drag-order in the same prefs file) for the shape. `tableId` for this grid is `'orders'`.
  Pending currently does **not** mount `useColumnWidths` (fixed tracks — keep it that way).

### DnD house pattern (reuse, don't import a new lib)

- `@dnd-kit/core ^6.3.1` + `@dnd-kit/sortable ^10` are installed. **`SwimlaneBoard.tsx` is the model**:
  `PointerSensor` activation `distance: 6`, `KeyboardSensor` + `sortableKeyboardCoordinates`,
  `SortableContext` + `arrayMove`, persist to staff prefs on drag end. FBA sidebar uses distance 5.
  Use the house 6px (industry range is 5–10px; dnd-kit docs' canonical example is 8).

### Platform SoT

- `SourcePlatformMeta { value, label, mark, text, border }`; values:
  `ebay(eB) amazon(az) fba(FB) aliexpress(AE) walmart(W) goodwill(Gw) ecwid→"ECWID-RS"(Ec) square(Sq)
  shopify(Sh) other(·)`. `PlatformMark` today = fixed `h-7 w-7` **lettermark** box (no images).
- Known fork to unify while here: `src/utils/order-platform.ts` carries its own `PLATFORM_COLORS` map
  + `marketplaceOrderUrl` — converge tones on the source-platform SoT (compound opportunity).

### Replenishment / OOS payload truth

- `/api/orders` selects `replenishment_request_id / replenishment_status /
  replenishment_quantity_to_order / replenishment_po_number (rr.zoho_po_number) / replenishment_notes`,
  latest-per-order via a ranked CTE, **gated by `hasReplenishmentSchema()`** — all NULLs when the
  schema is absent; the display must degrade quietly. `out_of_stock` is raw legacy text.
- **No stock-on-hand / available-qty field is on the payload.** `sku_catalog` is already LEFT-JOINed
  (only title/sku/image/category selected) — an available-qty join is the cheap candidate but is
  **ask-first**. Replenishment `created_at` (for an "age of exception" metric) is not selected —
  add it to the SELECT if that metric is wanted.

### Editor primitives on hand

- Dates: `DateTimePickerField` / `Calendar` (react-day-picker v10, Radix Popover). Calendar widgets
  must round-trip via `dateKeyToLocalDate` / `localDateToDateKey` (civil-date SoT law).
- Selects: `SearchableSelectField`, `FilterDropdownSelect`, `Popover` primitive. **No in-cell
  select/date editor exists yet.** `RowInlineEditBubble` is free-text only (notes/oos), body-portaled,
  commits on Enter/outside-click, cancels Esc — it is the thing Phase 4 replaces.

### Interaction + test guardrails (keep green)

- The whole row is currently clickable (`role` button/checkbox, Enter/Space → open); selection is
  **always live** via `useTableSelectMode` (gutter checkbox toggles without opening; shift-range works).
  Tracking paste/replace already mutates through assign.
- E2E that must not regress (`to-ship-pending-grid.spec.ts`, `orders-queue-skin-scoping.spec.ts`):
  icon-only headers with exact `sr-only` labels, frozen title sticky (<3px drift on h-scroll),
  per-cell border rules (last col 0 right border), white opaque header, header/body column X alignment
  (<4px), and **Packed table stays gray** (skin is opt-in, must not leak).

---

## Phase 0 — Research (mandatory, before UI code)

Use web search and summarize in ≤15 bullets what “industry standard” means for **ops fulfillment grids** in 2025–2026:

1. Column reorder UX (drag handle vs whole header; activation distance; keyboard; persistence).
2. Pinned / frozen identity columns vs scrollable facts.
3. Google Sheets–style **in-cell** editing (click → edit, Enter commit, Esc cancel, Tab next, blur commit; typed editors: text, number, select, date).
4. Icon vs text for marketplace / channel columns (fixed footprint).
5. Exception / OOS presentation as **metrics** (counts, status, stock shortfall) vs free-text flags.

Adopt those patterns **within Kinetic Ledger tokens**. Document the chosen patterns in a short “Adopted standards” section at the top of an updated handoff under `docs/todo/`.

### Research digest — pre-gathered 2026-07-21 (adopt these; verify only what you extend)

Phase 0 is substantially done. The bullets below are the industry baseline, cross-checked against
Airtable's grid docs, AG Grid's column-moving + cell-editing docs, the W3C APG grid pattern, dnd-kit
sensor docs, TanStack column-ordering docs, and 2026 data-table design references.

**Column reorder**

- Drag the **whole header cell** (Airtable: click-hold-drag the field header; AG Grid: header drag).
  No separate grip glyph in the header — the activation distance does the click-vs-drag disambiguation.
- Activation constraint: pointer must travel a threshold before drag starts (dnd-kit
  `PointerSensor { activationConstraint: { distance } }`). Industry 5–10px; **use the house 6px**.
- Locked columns: AG Grid distinguishes `lockPosition: 'left'` (column can't move **and** others can't
  cross it) from `suppressMovable` (column can't be dragged, others flow around). **Select needs
  `lockPosition` semantics.** Airtable's primary field is permanently first, frozen, and unhideable —
  that is the precedent for locking **`title`** too: `select · title` locked left, everything else
  reorderable. (This resolves Phase 1's "unless research says otherwise".)
- Keyboard path: AG Grid = focus header, **Shift+←/→** moves the column; dnd-kit `KeyboardSensor` +
  `sortableKeyboardCoordinates` (Space to lift, arrows to move, Space to drop) is equivalent. Ship one.
- Persistence is not optional: "If you build these, persist the layout" — a layout that resets on
  reload defeats the feature. Airtable auto-saves field order per view; here it's per staff.

**Frozen / pinned + scroll**

- Sticky header is mandatory past one screen; frozen identity column(s) keep rows scannable during
  h-scroll; **subtle shadow at the frozen edge** signals depth (already implemented via
  `cf-grid-scrolled` + `data-frozen-edge` — keep it working after reorder).

**In-cell editing (Sheets / Excel / AG Grid / APG consensus)**

- **Two modes: Navigate vs Edit** (W3C APG grid; Excel/Sheets F2 muscle memory). Navigate = arrows
  move cell focus (roving tabindex — exactly one tabbable cell); Edit = keys go to the editor.
- **Start edit:** `Enter` or `F2` (preserves existing content, caret in field); **typing a printable
  character** starts editing and replaces content; double-click default, single-click acceptable for
  low-risk ops grids (AG Grid `singleClickEdit`).
- **Stop edit:** `Enter` commits (optionally moves down — Sheets does, AG Grid opt-in), `Esc` cancels
  and reverts, `Tab` commits + next cell, `Shift+Tab` commits + previous, **blur / clicking another
  cell commits** (AG Grid `stopEditingWhenCellsLoseFocus`).
- Editable cell in edit mode moves DOM focus into its input; a cell hosting a single widget
  (checkbox/select) may focus the widget directly (APG).
- Inline editing is for **single-field, low-risk** changes; multi-field edits stay in the detail pane
  (matches keeping the right pane for everything else).
- **Click-to-edit vs click-to-open (the split, decided):** Airtable never opens the record from a cell
  click — a cell click **selects**; the record opens only via the **expand affordance on the primary
  cell** (Space / Shift+Space). Adopt: editable cells select→edit on click; the Product cell gains an
  explicit hover/focus **expand control** that opens the detail pane; non-editable cells (age, order,
  tracking) keep row-click-opens.

**Platform / brand icons**

- Fixed-footprint **monochrome** marks in a constant box; tooltip + `sr-only` carry the full label
  (never icon-only without an accessible name). [Simple Icons](https://github.com/simple-icons/simple-icons)
  is the standard source: 3,000+ brand SVGs, **CC0-licensed paths**, monochrome by design — covers
  eBay, Amazon, Walmart, Shopify, Square, AliExpress. Per-brand trademark guidelines still apply:
  simple mark only, no lockups, nominative use in a data column is standard practice.
- Status/badge cells combine color **with** text/icon/shape — never color alone.

**Alignment / density (2026 table baseline)**

- Numbers/currency **right-aligned** (digits align by place value), text left, dates consistent one
  way; headers visually quiet until interaction; a **single subtle row separator** beats border soup
  (the airtable skin's thin `border-subtle` rules already comply).

**OOS / backorder as metrics**

- The standard backorder row exposes: **remaining/shortfall qty · fulfillment status · expected supply
  signal (PO / receipt) · age of the exception** — not a free-text flag. Map directly onto the
  `replenishment_*` fields (see Codebase grounding).

**Sparse facts & chip editors (added 2026-07-21)**

- **Corner-triangle indicators** (Excel, Google Sheets): a note/comment = small triangle in the
  cell's **top-right** corner, hover reveals the text; Excel's error flag = **top-left** corner
  triangle — a ready-made two-corner vocabulary (note vs exception). Modern SaaS sheets ship the
  same pattern (Equals: corner indicator + anchored hover popover). Sheets binds **Shift+F2** to
  insert/edit a note.
- **Chip-as-trigger enum editing** (Airtable, Canva sheets): single-select values render as compact
  SoT-toned pills; the focused cell exposes a dropdown caret to change the value in place; empty
  cells show a quiet `Not set ⌄`. Airtable's row-height menu defaults to **Short** (densest) —
  fixed short rows + truncation beat wrapping.
- Mobbin visual refs: [Airtable grid — status pills, in-row dropdown, `Open >` expand](https://mobbin.com/screens/077450d8-e703-41f6-9824-253b7139002d) ·
  [Canva sheet — `Not set ⌄` chips + cell comment popover](https://mobbin.com/screens/2f6674d5-363a-4e0c-a640-05f92cd2cb5a) ·
  [Equals — cell-corner comment indicator](https://mobbin.com/screens/2ef1f546-3ce1-4bd7-85c5-48949d2686b9)

Sources: [Airtable grid view](https://support.airtable.com/docs/airtable-grid-view) ·
[AG Grid column moving](https://www.ag-grid.com/javascript-data-grid/column-moving/) ·
[AG Grid cell editing start/stop](https://www.ag-grid.com/react-data-grid/cell-editing-start-stop/) ·
[W3C APG grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) ·
[dnd-kit pointer sensor](https://docs.dndkit.com/api-documentation/sensors/pointer) ·
[TanStack column ordering](https://tanstack.com/table/v8/docs/guide/column-ordering) ·
[Setproduct data-table guide 2026](https://www.setproduct.com/blog/data-table-ui-design) ·
[Simple Icons](https://github.com/simple-icons/simple-icons) ·
[Inline editing best practices](https://uxdworld.com/inline-editing-in-tables-design/) ·
[Backorder report anatomy](https://kadimagroup.ca/odoo-backorder-report/)

---

## Phase 1 — Industry-standard display baseline

Make the Pending grid read as a real spreadsheet, not a card list:

- Continuous light cell grid, sticky opaque header, frozen select (+ title unless research says otherwise — keep title frozen unless reorder of title is required; if title is reorderable, only `select` stays pinned).
- Icon-only tall header stays; tooltips = full labels.
- Numbers right-aligned (Qty); dates compact civil (`src/utils/date.ts`); conditions from SoT labels/tones.
- No truncated competing text in Platform; no variable-width marketplace names.
- Contain overflow; zebra/opaque frozen pane intact.
- Keyboard: arrow/focus model must not fight inline edit (Sheets: edit mode vs navigate mode).
- **Purposeful-cell doctrine (this update):** only `title` flexes; every other track is fixed and as
  narrow as its widest realistic value. Enum facts render as SoT-toned **chips**; sparse facts
  (notes, OOS reason) render as **corner indicators** — a fact that is empty on most rows never
  earns a full column. Truncate + `HoverTooltip` anything longer than its track; wrapping and
  row-height growth are banned (selection law: background + ring only, never a size shift).

---

## Phase 2 — Column reorder (except Select)

**Requirement:** I must be able to **drag columns to a new order**. **Select cannot move.**

Implement:

1. Header drag-reorder for every column except `select` (dnd-kit or existing house DnD — prefer what the repo already uses for lane/board reorder).
2. Activation constraint so click/edit doesn’t start a drag (industry: ~8px distance or grip-only).
3. Persist order per staff in `staff_preferences.tableColumns['orders'].order: string[]` (or a dedicated `pending-grid` tableId if cleaner — prefer one SoT; preserve sibling `hidden`/`widths` on write like `useColumnWidths` already does).
4. Apply order to **both** header and every body row / group summary (`ordersQueueGridTemplate` must respect order).
5. Unknown/missing keys fall back to canonical `ORDERS_QUEUE_COLUMNS` order.
6. Reset path: double-click header grip or a small “Reset column order” affordance is fine — keep chrome minimal (no full TableOptions menu).
7. Unit tests for order apply/fallback; e2e: drag Platform past Cond (or similar) → reload → order persists; assert select still first/frozen. (Sanitizer must also drop the retired `notes` key from stale persisted orders.)

### Grounded implementation strategy (from the codebase audit — follow this shape)

- **Lock `title` too** (research digest: Airtable primary-field precedent). Locked set =
  `ORDERS_QUEUE_FROZEN_KEYS` (`select`, `title`) — one SoT for "frozen" and "immovable", so
  `ordersQueueFrozenLeft()` math stays valid without new cases.
- **Cell-renderer registry, not conditional JSX.** Rows/summaries/header currently render cells in
  fixed JSX order. Extract per-column renderers keyed by `OrdersQueueColumnKey`
  (`Record<OrdersQueueColumnKey, (ctx) => ReactNode>`) in `OrdersQueueTableRow`,
  `OrderGroupSummary`, and `OrdersQueueColumnHeader`, then map all three over **one** ordered
  `OrdersQueueColumn[]`. This is the only way header/body/summary can never disagree.
- **Grow the template SoT**: `ordersQueueGridTemplate(order?: OrdersQueueColumnKey[])` +
  `orderedOrdersQueueColumns(order?)` in `dashboard-order-row-layout.ts`. Sanitizer contract:
  force locked keys to the front in canonical relative order → keep known keys in the persisted
  order → append any missing canonical keys at their canonical position → drop unknown keys.
  Unit-test the sanitizer directly (empty, stale keys, missing keys, locked-key displacement).
- **DnD wiring**: copy `SwimlaneBoard.tsx`'s recipe — `DndContext` + `SortableContext`
  (`horizontalListSortingStrategy`) around the header cells only; `useSortable` per data column;
  `PointerSensor { distance: 6 }` + `KeyboardSensor` with `sortableKeyboardCoordinates`;
  `arrayMove` on drag end → persist. Transform via `CSS.Transform` on the header cell — **never**
  animate body-cell layout (motion law). Body columns snap to the new template on drop.
- **Persist** in `tableColumns['orders'].order: string[]` via the `useColumnWidths` write pattern
  (optimistic `setQueryData` on staff-prefs key → `PUT /api/staff-preferences` carrying the whole
  `tableColumns` map → rollback on failure), preserving sibling `hidden`/`widths` —
  `{ ...prev.tableColumns?.orders, order: next }`. Shape mirrors `BoardPrefs.order`.
- **Interplay with select-all**: the header select checkbox lives in the locked `select` cell — it
  must remain outside any `useSortable` wrapper so drag listeners never swallow its clicks.
- **Keep the skin-scoping e2e green**: reorder chrome must not alter header bg/backdrop, sr-only
  labels, or leak into Packed (`column-table-body`).

---

## Phase 3 — Platform brand icons (fixed footprint)

**Problem:** platform **names** (and even lettermarks) create inconsistent column width / visual weight.

**Requirement:** download platform icons and display them as **fixed-size marks** (e.g. 16×16 or 20×20 in a fixed cell), tooltip = full platform label.

Do:

1. Web-search / fetch **official or clearly licensed** simple SVG/PNG marks for platforms in `SOURCE_PLATFORMS` (eBay, Amazon, FBA, AliExpress, Walmart, Goodwill, Ecwid/ECWID-RS, Square, Shopify, Other). Prefer monochrome or single-color marks that work on light Kinetic Ledger surfaces. Respect trademark usage (simple mark, not full logo lockups if restricted).
2. Store under something like `public/icons/platforms/{value}.svg` (or `src/design-system/assets/platforms/`) and register paths on `SourcePlatformMeta` (grow `src/lib/source-platform.ts`).
3. New or evolved component (prefer grow `PlatformMark`): `<PlatformIcon value={…} />` — fixed box, `object-contain`, never stretches the column.
4. Pending Platform column uses the icon **only** (plus tooltip / `sr-only` label). Variable-width text labels go away in this column.
5. Keep listing open/copy behaviors, but the **primary visual** is the icon.

### Grounded notes (icons)

- **Source decision**: Simple Icons (CC0 SVG paths, monochrome) covers `ebay, amazon, walmart,
  shopify, square, aliexpress` (Ecwid likely too — check the catalog). **No brand mark exists for
  `fba`, `goodwill`-as-thrift-generic, `ecwid` (ECWID-RS variant), `other`** — for those the
  fallback is the existing lettermark. Vendor the SVGs into the repo (inline path data or
  `src/design-system/assets/platforms/`) — never hotlink a CDN (CSP + build gotchas).
- **Grow `PlatformMark`, don't fork**: extend `SourcePlatformMeta` with an optional `icon` field;
  `PlatformMark` renders the icon (fixed box, `currentColor` fill tinted by the existing `text` tone)
  when present, else the current lettermark. One component keeps every existing call site correct
  and gives non-Pending surfaces the icons for free.
- Cell footprint: reuse the `h-7 w-7` box `PlatformMark` already owns (icon ~16–20px inside,
  `object-contain`/fixed `viewBox`), `HoverTooltip` + `sr-only` = `sourcePlatformLabel(value)`.
- **Unify the fork while here**: `src/utils/order-platform.ts` has a parallel `PLATFORM_COLORS`
  map — converge its tones onto the source-platform SoT (compound opportunity, low blast radius).

---

## Phase 4 — Sheets-style inline edit

Replace bubble-popover editing for these cells with **in-cell** edit (Google Sheets mental model):

| Column | Editor | Commit path |
|---|---|---|
| **Notes** | **no notes column** — corner-indicator popover (Phase 4b): click the note triangle (or Shift+F2 on the focused row) opens a small cell-anchored editor; Enter commits, Shift+Enter newline, Esc cancels, blur commits | `useOrderAssignment` `{ notes }` |
| **Condition** | **chip-as-trigger dropdown**: the `ConditionGradeChip` in the cell IS the button; click/Enter opens a listbox over `conditionOptions()` (SoT labels + tones); empty cell renders a quiet `— ⌄` set-affordance (Canva-sheet `Not set ⌄` pattern) | `{ condition }` |
| **Ship by (Date)** | in-cell date editor; warehouse civil day via `src/utils/date.ts` | `{ shipByDate }` (wire through existing assign API; ensure deadline/`work_assignments` side matches current backend contract — do not invent a second deadline writer) |
| **Qty** | in-cell number; integer ≥ 1 (or house rules); right-aligned | `{ quantity }` |
| **Title (Product)** | in-cell text edit for product title **and** an **Edit listing link** control | title mutation if API supports it; listing URL edit must update the stored product/listing URL field the row already uses for `productPageUrl` — find the real field/API (do not fake UI) |

Also:

- **Platform column** must expose an **Edit listing link** button (icon button / hover affordance) that edits the same listing URL as Title’s listing control — one SoT editor, two entry points if needed.
- Empty cells show a quiet placeholder and still open the editor on click/focus.
- Optimistic UI via existing `useOrderAssignment` cache patching; toast on failure; no full-row remount flicker.
- Do **not** open the right detail pane when entering edit mode (click-to-edit vs click-to-open: Sheets edit on focused cell; row open stays for non-editable areas / explicit open affordance — pick an industry-standard split and document it). **Split decided in the research digest**: editable cells click→select→edit; Product cell gains an explicit expand affordance that opens the pane; non-editable cells keep row-click-opens.
- Extend e2e + unit coverage for commit/cancel on each field.

### Keyboard contract (adopt exactly — Sheets/AG Grid/APG consensus)

| Key | Navigate mode | Edit mode |
|---|---|---|
| `Enter` / `F2` | start editing focused cell (content preserved) | commit; focus stays on cell |
| printable char | start editing, **replace** content | types |
| `Esc` | clear cell focus | cancel + revert draft |
| `Tab` / `Shift+Tab` | next/prev focusable | commit + move next/prev editable cell |
| blur / click other cell | — | **commit** (never silently drop a draft) |
| `Shift+Enter` | — | newline (Notes multiline only) |

Roving tabindex: exactly one tabbable cell per grid (APG). Scope pragmatically — editable cells +
row focus is enough; full arrow-key 2-D navigation is a stretch goal, not a blocker.

### Grounded notes (inline edit)

- **All five editors commit through `useOrderAssignment`** — the payload already accepts every field
  (`notes, condition, quantity, shipByDate, itemNumber, outOfStock, …`); optimistic patching +
  rollback already exist. Do not add mutation hooks. Open check: verify `/api/orders/assign` maps
  `shipByDate` onto the same deadline/`work_assignments` write the current ship-by path uses.
- **Listing link is `item_number`** (resolved — see Codebase grounding): the "Edit listing link"
  editor edits `item_number` (via assign `itemNumber` or `POST /api/orders/set-item-number` — pick
  one, prefer the assign waist for optimistic patching) and `productPageUrl` re-derives via
  `getExternalUrlByItemNumber`. A stored URL column is ask-first; don't build it silently.
- **Editor primitives**: Condition → `SearchableSelectField`/listbox over `conditionOptions()`;
  Ship-by → `Calendar` (`mode="single"`) in a cell-anchored `Popover`, round-tripping
  `dateKeyToLocalDate`/`localDateToDateKey` (civil-date law — never `new Date(dateKey)`); Qty →
  right-aligned number input; Notes/Title → in-cell text. No in-cell editor primitive exists yet —
  build one `LedgerCellEditor` shell (focus trap, commit/cancel keys, opaque bg) and give it typed
  variants, rather than five bespoke editors.
- **Virtualization hazard**: rows unmount outside the ~10-row overscan. Hoist draft state to a
  controller keyed `orderId+field` (or commit-on-unmount) so scrolling can't eat an edit. The current
  `RowInlineEditBubble` keeps state in the row — that bug must not carry over.
- **Zebra/frozen constraint**: editors render inside cells whose frozen siblings use `bg-inherit` —
  keep the editing cell's background opaque and don't change row height while editing (selection law:
  background + ring only, never a size shift).
- Retire `RowInlineEditBubble` from this grid when Notes/OOS move to corner indicators (Phase 4b
  owns the details); delete it if Pending was its last consumer (`grep` first — no dead siblings).

---

## Phase 4b — Sparse facts as corner indicators (Notes · OOS)

Notes and OOS-reason are **sparse** facts — most rows have neither. The industry answer (Excel,
Google Sheets, Equals) is: don't spend a column; mark the cell with a tiny corner triangle and
reveal the exact text on hover.

1. **Note indicator** — small triangle in the **top-right** corner of the Product cell (Sheets'
   black note triangle / Excel's red comment triangle). Neutral/slate tone from semantic tokens.
2. **OOS indicator** — small triangle in the **top-left** corner of the Product cell (Excel's
   error-checking corner). Danger/rose tone. Distinct corner + tone ⇒ the two never collide.
3. Both live on the **frozen** Product cell, so they stay visible during horizontal scroll — the
   operator never loses the exception signal while scanning right-side facts.
4. **Hover/focus = exact content** via `HoverTooltip` (house SoT — body portal, never clipped):
   note triangle → full note text; OOS triangle → the exact `out_of_stock` reason plus the
   replenishment one-liner (status · qty-to-order · PO#) when present.
5. **Click = edit.** Note triangle (or **Shift+F2**, the Sheets insert-note key, on the focused
   row — also the add-note path for rows with no note yet) opens the small cell-anchored note
   editor; Phase-4 keyboard contract applies (Enter commit · Shift+Enter newline · Esc cancel ·
   blur commit). OOS triangle click opens the OOS editor only for `orders.create` holders
   (existing `canOos` gate).
6. **Accessibility**: each indicator is focusable with `sr-only` text ("Has note", "Out of stock:
   reason"); the triangle's color is never the only signal — the tooltip text is the content.
7. **Geometry**: absolutely positioned in the cell's corner (CSS border-triangle or a 6–8px SVG);
   must **not** change row height, title truncation width, or the frozen-edge shadow; zebra stripe
   stays opaque behind it.
8. Adding/clearing a note flips the indicator **optimistically** through the same
   `useOrderAssignment` cache patch — no refetch, no row remount.
9. Retire `RowInlineEditBubble` from this grid once notes/OOS move to indicators; delete it if
   Pending was its last consumer (grep first).

Pattern references: Excel corner triangles ([comment indicator](https://www.techonthenet.com/excel/cells/comment_ind2010.php), [triangle meanings](https://www.excelarticles.com/excelbook/what_do_all_the_triangles_mean.html)) · Google Sheets note triangle + [Shift+F2 insert-note](https://geosheets.com/google-sheets-shortcuts/insert-note/) · the same pattern in modern SaaS sheets: [Equals cell-corner indicator + hover popover](https://mobbin.com/screens/2ef1f546-3ce1-4bd7-85c5-48949d2686b9).

---

## Phase 5 — OOS as data-driven metrics (not free-text chrome)

**Requirement:** OOS is a **data-driven display metric**, not a free-text bubble sharing the Notes column.

Interpret and implement as:

1. Surface facts already available on the orders payload where possible:
   - `out_of_stock` (legacy exception text — demote; don’t primary-display as the metric)
   - `replenishment_request_id`, `replenishment_status`, `replenishment_quantity_to_order`, `replenishment_po_number`, `replenishment_notes` (already selected in `/api/orders`)
2. **Decided (purposeful-cell plan): a dedicated fixed `stock` column** (track funded by the deleted `notes` column) holding a compact metric chip that shows:
   - shortfall / qty-to-order when replenishment exists
   - status tone from SoT (pending / ordered / etc.)
   - empty/quiet when in stock and no replenishment
3. If stock-on-hand / available qty exists on the row or via a cheap joined fact, show **need vs available** style metrics. If not on the payload, either join it properly (ask-first if schema/migration) or clearly document the metric formula from existing fields — **no fake numbers**.
4. Editing OOS reason (if still needed) must not look like Notes; keep Notes pure for operator notes.
5. Metrics must update when dogfood data changes (after assign/replenishment mutations invalidate queries).

### Grounded field mapping (industry backorder-row anatomy → this payload)

| Standard metric | Source on `/api/orders` payload | Note |
|---|---|---|
| Shortfall / qty to order | `replenishment_quantity_to_order` | show vs row `quantity` (`need 2 · ordering 1` style) |
| Fulfillment status | `replenishment_status` | tone via a small registry (`workflow-stages.ts` style) — **never** an inline map in the view |
| Expected supply signal | `replenishment_po_number` | render through the CopyChip family if it's a typed identifier |
| Age of exception | **not selected today** | `replenishment_requests.created_at` — add to the ranked-CTE SELECT if wanted (cheap, same join) |
| Legacy flag | `out_of_stock` (free text) | demote to tooltip/secondary; never the primary metric |

- All `replenishment_*` fields are NULL when `hasReplenishmentSchema()` is false — the cell must
  degrade to quiet-empty, never crash or show placeholder junk.
- **Need-vs-available**: no stock-on-hand exists on the payload. `sku_catalog` is already LEFT-JOINed
  (only title/sku/image/category selected) — extending that SELECT with an available-qty column is
  the cheap path, but it's **ask-first**; until then the metric formula is documented shortfall only
  (no fake numbers).
- Mutation note: `useOrderAssignment` patches caches optimistically and does **not** invalidate on
  success — if replenishment facts change through a different mutation, make sure that path
  invalidates `['orders']` or the metric goes stale until reload.
- The free-text `out_of_stock` reason surfaces **only** via the Phase-4b corner-indicator hover —
  the `stock` column carries strictly data facts (shortfall, status tone, PO chip), never prose.
- Track budget: `stock` is funded by the deleted `notes` flex track (see Target column plan). Keep
  it fixed and narrow; **quiet-empty** (no chip at all) when in stock with no replenishment.

---

## Phase 6 — Dogfood org 01 extensive testing (mandatory)

Dogfood tenant = **organization id 01** (USAV dogfood). Use the running app (typically `pnpm dev` on the main lane :3000) with a real session.

### Prep

1. Confirm you are in **org 01**.
2. Find or create a **testing order** on Pending (`/dashboard?unshipped`) — prefer an obvious test SKU/title (e.g. contains “test” / known dogfood fixture). If you must create one, use existing house flows (do not invent raw SQL unless the repo already has a sanctioned script). Note the `order_id` / internal id in the handoff.
3. Ensure the order has (or can receive): listing URL, platform, qty, condition, notes, ship-by, and ideally a replenishment or OOS signal so metrics are visible.

### Manual / browser matrix (do every row; record pass/fail)

| # | Scenario | Expect |
|---|---|---|
| 1 | Load Pending grid | Spreadsheet shell, sticky header, frozen select, no day bands |
| 2 | Reorder columns (e.g. move Notes before Qty) | Live reorder; select immovable |
| 3 | Reload page | Column order persisted for this staff |
| 4 | Reset order (if implemented) | Back to canonical |
| 5 | Platform column | Fixed-size brand icon; tooltip = platform name; no wide text |
| 6 | Note via corner indicator | Slate triangle top-right of Product cell; hover = full text; click / Shift+F2 opens editor; persists after reload |
| 7 | Edit Condition via chip dropdown | Chip opens SoT listbox; tone/label correct; empty shows quiet set-affordance; persists |
| 8 | Edit Ship-by in-cell | Civil date; Age/SLA update; persists |
| 9 | Edit Qty in-cell | Persists; alignment correct |
| 10 | Edit Title | Persists |
| 11 | Edit listing link from **Title** affordance | Opens editor; URL used by open-listing |
| 12 | Edit listing link from **Platform** affordance | Same SoT URL; open listing works |
| 13 | OOS indicator + stock metrics | Rose triangle top-left of Product cell, hover = exact reason; stock chip matches replenishment facts; quiet-empty when in stock |
| 14 | Sort switcher still works | Priority / Newest / Deadline |
| 15 | Open row detail still works | Without fighting inline edit |
| 16 | Select-all / multi-select | Still works with frozen select |
| 17 | Horizontal scroll | Frozen pane correct after reorder |
| 18 | Empty Pending search empty-state | Unbroken |
| 19 | Mobile / narrow (if applicable) | No crash; desktop is source of truth |
| 20 | Truncation | Long titles/values truncate + tooltip full text; row height never changes |
| 21 | Indicators while h-scrolled | Note/OOS triangles stay visible (frozen Product cell) |
| 22 | `npm run verify` | All gates green |

Use Playwright MCP / cursor-ide-browser or Chrome DevTools MCP for the interactive pass; keep screenshots under `test-results/` for the critical states (reorder, platform icons, in-cell editors, OOS metrics).

Add/extend automated e2e for: column reorder persistence, platform icon presence, at least one in-cell edit round-trip (notes or qty), listing-link editor open.

---

## Phase 7 — Done definition

Ship only when:

- [ ] Research notes captured (“Adopted standards”)
- [ ] Column reorder works; select locked; order persisted
- [ ] Platform icons downloaded, registered in SoT, fixed footprint
- [ ] Condition (chip dropdown), Ship-by, Qty, Title are in-cell editable; Notes/OOS edit via corner-indicator popovers (Phase 4b)
- [ ] Purposeful-cell plan landed: `notes` column deleted, `stock` track added, `platform` shrunk to icon track; truncation + tooltip everywhere, constant row height
- [ ] Title + Platform expose Edit listing link (shared SoT)
- [ ] OOS is data-driven metrics display
- [ ] Dogfood org 01 testing order matrix completed (attach results)
- [ ] Unit + e2e updated; `npm run verify` green
- [ ] Handoff updated: `docs/todo/pending-grid-minimal-simplify-handoff.md` (or a new sibling) reflecting the new contract
- [ ] Work-log entry written
- [ ] Short “Compound opportunities” note (Do now / Promote to DS / Deferred)

### Out of scope (unless you must ask)

- Bringing back density toggles / column-hide popover / drag-resize
- Swimlane board / day bands
- Multi-tenant schema migrations without asking
- Changing Packed / Board / Testing table chrome beyond shared primitive needs (if a shared primitive must grow, keep board consumers safe via props)

### Compound opportunities (fill at end)

- Do now (in scope / low blast radius): …
- Promote to DS next (2+ call sites): …
- Deferred (ask first / multi-page): …

---

## Start command

1. `pnpm worklog:tail` + read the handoff + **Codebase grounding** section above + `ORDERS_QUEUE_COLUMNS` + `OrdersQueueTableRow` edit path.
2. Read the Phase-0 **Research digest** (pre-gathered) → copy it as the “Adopted standards” section of the updated handoff, extending only where you deviate.
3. Implement Phases 2→5 in order (reorder → icons → inline edit → corner indicators → stock metrics), verifying dogfood continuously.
4. Finish with Phase 6 matrix + `npm run verify`.
