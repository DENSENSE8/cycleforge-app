/**
 * Dashboard / queue table row layout.
 *
 * Desktop anatomies:
 *   • **legacy** (`dashboardOrderRowShellClass`) — title+meta stack left, chips right.
 *     Mobile fallback + pipeline board lanes + Tech/Packer week rows still use this.
 *   • **orders queue columns** (`ordersQueueRowShellClass`) — Google-Sheets-like
 *     WMS grid (Outbound Pending · Tested · Packed · Labels · Staged · Shipped · Review):
 *       select · order · late · product · cond · qty · tracking · _fill
 *     (frozen identity pane = select · order · age · title; Product-only resize;
 *      trailing `_fill` absorbs leftover width so Product drag is a hard width)
 *       (Tested tab: tester · testedAt insert after product, before cond)
 *   • **Incoming columns** (`INCOMING_GRID_COLUMNS`) — LedgerGrid for `/incoming`:
 *       select · title · date · age · qty · cond · status · platform · order · tracking
 *   • **Receiving browse columns** (`RECEIVING_GRID_COLUMNS`) — LedgerGrid for
 *     Unbox / History / Testing: select · title · qty · cond · stage · platform ·
 *     order · tracking · serial
 *
 * Driven by UIMode `isMobile` — desktop mode always renders the chosen desktop
 * anatomy regardless of viewport width.
 */

import {
  gridFrozenKeys,
  isGridColumnResizable,
} from '@/design-system/components/grid/grid-column-editability';
import {
  gridColVar,
  gridColumnTrackRem,
  gridContentMinWidthRem,
  gridFrozenLeft,
  gridHeaderShowsLabel,
  gridTemplate,
} from '@/design-system/components/grid/grid-column-geometry';
import type { LedgerGridColumnModel } from '@/design-system/components/grid/grid-surface-descriptor';
import {
  LEDGER_GRID_CELL_INSET,
  LEDGER_GRID_FROZEN_CELL,
  ledgerGridCell,
  ledgerGridRowShellClass,
  ledgerGridWidthVarValue,
} from '@/design-system/components/grid/grid-cell-chrome';
/** Stable key set for the desktop orders-queue columns (scan order). */
export type OrdersQueueColumnKey =
  | 'select'
  | 'title'
  /** Derived days past ship-by (`0d` / `3d` / …). Replaced fused `sla` / `date`. */
  | 'age'
  | 'condition'
  | 'qty'
  | 'tester'
  | 'testedAt'
  | 'packStation'
  | 'order'
  | 'tracking'
  /** Trailing structural filler — absorbs leftover sheet width (`1fr`). */
  | '_fill';

/**
 * One column of the desktop orders-queue grid — the SoT that the grid template,
 * the sticky header (label + type glyph + per-column menu), and the body/group
 * cells all read, so a column's width, label, type, and hide-key live in ONE
 * place and can never drift apart.
 *
 * EXTENDS the house model rather than re-declaring it. `width` / `label` /
 * `gridLabel` / `labelFitRem` / `type` / `hideKey` were all copied out with
 * their own JSDoc here, which is how a Pending-only field could drift from the
 * same field on every other surface — and why `align` and `omitCellIcon` had to
 * be added in five places before this. Every shared field is inherited; only
 * `key` narrows.
 *
 * House conventions this surface relies on (all enforced by the shared model +
 * geometry waist, not by this declaration): fact columns use `minmax(X, X)` so
 * they never shrink below cell content, Product is hard-width + resizable with
 * trailing `_fill` as the sole `1fr` track, and a track narrower than its
 * `labelFitRem` degrades to glyph + `sr-only` rather than a truncated word.
 */
export interface OrdersQueueColumn extends Omit<LedgerGridColumnModel, 'key'> {
  key: OrdersQueueColumnKey;
}

/**
 * Canonical Pending-tab column model, in strict scan order:
 *   select · order · late · product · cond · qty · tracking · _fill
 * Never mix `auto`/`fr` for the same slot across rows, or columns drift (the
 * uneven look the Sheets rewrite exists to kill).
 *
 * **Order** (`order`) is the lead identity track, not a fact column: it is the
 * container the operator scans a dispatch queue by, so it is frozen beside
 * select and carries **no `hideKey`** — the Fields menu can never take the
 * row's identity away. (It previously hid under the legacy `orderid` key; a
 * persisted `hidden: ['orderid']` delta is now inert, because
 * `isGridColumnVisible` short-circuits on a missing `hideKey`. That is the
 * whole migration — no pref rewrite needed.)
 *
 * **Late** (`age`) sits immediately after Order (urgency before the long
 * product title) and is frozen with the identity pane so sanitize cannot shove
 * Product ahead of it. Face = derived days past ship-by via
 * {@link GridAgeCellValue} (`0d` / `3d` / …); the civil ship-by date stays in
 * the hover tooltip only. Display-only — no in-cell edit.
 *
 * **Product-only resize (2026-08-05):** only `title` is `resizable: true`. It
 * is a **hard** `minmax(12rem, 12rem)` track — drag writes `--cf-col-title` as
 * a real width. Trailing `_fill` (`minmax(0rem, 1fr)`) absorbs leftover sheet
 * width so narrowing Product is visible (a flex Product floor had no effect
 * while the card still fit). Deterministic fact tracks stay content-hard
 * `minmax(X,X)` + `resizable: false`.
 *
 * Status + Platform columns retired — lifecycle tabs (Pending · Tested) own the
 * lane; listing open stays on the product-cell hover link.
 * **Cond** (`condition`) sits after Product (Unbox adjacency) — Unbox flush
 * grade face (`conditionGradeTextClass` + table label). `tier: 'optional'`
 * (2026-08-10, operator ruling): the grade is a receiving-side fact that an
 * outbound picker does not act on, so it must not spend a default track on the
 * main To-ship lane. This is the alignment Unbox History already had — it marks
 * `condition` optional too — and it applies to BOTH lanes, since the default
 * and TESTED tabs share one `orders` prefs bucket and a column that appeared on
 * one tab and not the other would read as a bug. Opted back in from the ▦
 * column display, same door as Serial / Vendor / Station.
 * Note / OOS corners stay on Product. Fused `sla` / civil-date face retired
 * 2026-08-05 in favor of this compact days-late track.
 */
export const ORDERS_QUEUE_COLUMNS: readonly OrdersQueueColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', frozen: true, resizable: false },
  // `align: 'start'` — text/ID law (`type: 'id'` already starts as of 2026-08-04).
  // 2026-08-02): an ORDER number is the row's own transaction identity — a name
  // you read, and the first thing scanned on an order-anchored surface — not a
  // magnitude compared down the column. A catalog SKU / serial / ticket stays
  // end-aligned, which is why this is an override here and never a change to
  // the type map. See `source-of-truth.md` → Grid column justification.
  {
    key: 'order',
    // Identity language: brand dot, not the `#`/MapPin type glyph — the header
    // already names this column (`display/workbench-ops-queue.md`, ruled
    // 2026-08-20). This one flag is the whole switch: `OrdersQueueTableRow`
    // derives its chip `variant` from it, and the shared painter swaps the
    // glyph for the platform/carrier dot.
    omitCellIcon: true,
    // Same track as Unbox History ORDER (`RECEIVING_GRID_COLUMNS`) so last-8 +
    // brand-dot identity fits without ellipsis. 4.5rem was the to-ship fork
    // clipping marketplace ids into `66-47…`.
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Order',
    type: 'id',
    align: 'start',
    frozen: true,
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'age',
    // Compact `Nd` face — 4rem clears header "Late" (3.5rem clips to glyph).
    width: 'minmax(4rem, 4rem)',
    label: 'Late',
    type: 'number',
    frozen: true,
    resizable: false,
    labelFitRem: 4,
  },
  {
    key: 'title',
    // Hard width + resizable — `_fill` owns the 1fr slack (see module doc).
    width: 'minmax(12rem, 12rem)',
    label: 'Product',
    type: 'text',
    frozen: true,
    resizable: true,
    labelFitRem: 8,
  },
  {
    key: 'condition',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Cond',
    type: 'tag',
    align: 'start',
    hideKey: 'condition',
    tier: 'optional',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'qty',
    // 3.5rem is the floor for Sentence-case "Qty" under header chrome budget.
    width: 'minmax(3.5rem, 3.5rem)',
    label: 'Qty',
    type: 'number',
    hideKey: 'qty',
    resizable: false,
    labelFitRem: 3.5,
  },
  {
    key: 'tracking',
    // Identity language: brand dot, not the `#`/MapPin type glyph — the header
    // already names this column (`display/workbench-ops-queue.md`, ruled
    // 2026-08-20). This one flag is the whole switch: `OrdersQueueTableRow`
    // derives its chip `variant` from it, and the shared painter swaps the
    // glyph for the platform/carrier dot.
    omitCellIcon: true,
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Tracking',
    type: 'tracking',
    hideKey: 'tracking',
    resizable: false,
    labelFitRem: 5.5,
  },
  // Which packing bench this order is staged at (`order_pack_placements`).
  // `tier: 'optional'` — off by default, opted in from the ▦ column display,
  // the same way Unbox History treats Serial / Vendor. The bench is a real
  // per-row fact (the data already rides on every row), but it only matters
  // once someone is working the pack floor, so it must not spend a track on
  // the default To-ship lane. The Tested lane keeps it always-on.
  {
    key: 'packStation',
    width: 'minmax(7rem, 7rem)',
    label: 'Station',
    type: 'location',
    align: 'start',
    hideKey: 'packStation',
    tier: 'optional',
    resizable: false,
    labelFitRem: 5,
  },
  { key: '_fill', width: 'minmax(0rem, 1fr)', resizable: false },
] as const;

/**
 * TESTED-tab column model (`?tested` / fulfillment.tested): every row is TESTED,
 * so the lane surfaces **who tested** + **when** instead of a redundant Status
 * pill — Tester · Tested at dock after Product, then Cond. Field contract (plan
 * §9): tester name resolves `tested_by_name → tester_name → getStaffName(id)`
 * via `normalizePersonName`; tested-at prefers `test_date_time` then
 * `test_activity_at`, ignores the legacy `'1'` sentinel, formats via
 * `formatDateTimePST`.
 */
export const ORDERS_QUEUE_TESTED_COLUMNS: readonly OrdersQueueColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', frozen: true, resizable: false },
  {
    key: 'order',
    // Identity language: brand dot, not the `#`/MapPin type glyph — the header
    // already names this column (`display/workbench-ops-queue.md`, ruled
    // 2026-08-20). This one flag is the whole switch: `OrdersQueueTableRow`
    // derives its chip `variant` from it, and the shared painter swaps the
    // glyph for the platform/carrier dot.
    omitCellIcon: true,
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Order',
    type: 'id',
    align: 'start',
    frozen: true,
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'age',
    width: 'minmax(4rem, 4rem)',
    label: 'Late',
    type: 'number',
    frozen: true,
    resizable: false,
    labelFitRem: 4,
  },
  {
    key: 'title',
    width: 'minmax(12rem, 12rem)',
    label: 'Product',
    type: 'text',
    frozen: true,
    resizable: true,
    labelFitRem: 8,
  },
  {
    key: 'tester',
    width: 'minmax(6rem, 6rem)',
    label: 'Tester',
    type: 'text',
    resizable: false,
    labelFitRem: 4.5,
  },
  // Full `formatDateTimePST` string (MM/DD/YYYY h:mm:ss AM/PM) needs the widest track.
  {
    key: 'testedAt',
    width: 'minmax(10rem, 10rem)',
    label: 'Tested at',
    type: 'date',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'packStation',
    width: 'minmax(7rem, 7rem)',
    label: 'Station',
    type: 'text',
    align: 'start',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'condition',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Cond',
    type: 'tag',
    align: 'start',
    hideKey: 'condition',
    tier: 'optional',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'qty',
    width: 'minmax(3.5rem, 3.5rem)',
    label: 'Qty',
    type: 'number',
    hideKey: 'qty',
    resizable: false,
    labelFitRem: 3.5,
  },
  {
    key: 'tracking',
    // Identity language: brand dot, not the `#`/MapPin type glyph — the header
    // already names this column (`display/workbench-ops-queue.md`, ruled
    // 2026-08-20). This one flag is the whole switch: `OrdersQueueTableRow`
    // derives its chip `variant` from it, and the shared painter swaps the
    // glyph for the platform/carrier dot.
    omitCellIcon: true,
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Tracking',
    type: 'tracking',
    hideKey: 'tracking',
    resizable: false,
    labelFitRem: 5.5,
  },
  { key: '_fill', width: 'minmax(0rem, 1fr)', resizable: false },
] as const;

/** Mode ids for the orders-queue column model (per-lane layouts, plan Phase A). */
export type OrdersQueueColumnMode = 'fulfillment.default' | 'fulfillment.tested';

/** Column model per mode — the SoT `ordersQueueColumnsFor(mode)` reads. */
export function ordersQueueColumnsFor(
  mode: OrdersQueueColumnMode,
): readonly OrdersQueueColumn[] {
  return mode === 'fulfillment.tested' ? ORDERS_QUEUE_TESTED_COLUMNS : ORDERS_QUEUE_COLUMNS;
}

/** Parse the rem floor from a track (`minmax(3rem, 3rem)` / `3rem` / `minmax(12rem, 1fr)`). */
export const ordersQueueColumnTrackRem = gridColumnTrackRem;

/** Pending grid: whether the header should paint a visible short label (vs glyph-only). */
export const ordersQueueHeaderShowsLabel = gridHeaderShowsLabel;

/**
 * Sum of content-min rem floors for the given columns (or canonical set).
 * Applied as `minWidth` on gridSkin header/rows so h-scroll activates instead of
 * crushing fact tracks into the viewport.
 */
export function ordersQueueContentMinWidthRem(
  columns: readonly OrdersQueueColumn[] = ORDERS_QUEUE_COLUMNS,
): number {
  return gridContentMinWidthRem(columns);
}

/**
 * Viewport priority collapse (DevExtreme-style): when the scrollport is tight,
 * force-hide Qty. Ephemeral — not written to staff prefs.
 *
 * **`age` is protected and must stay that way.** Dropping Late would take the
 * days-past-ship-by urgency off a dispatch queue at exactly the width where
 * the operator is most likely on a small screen. Title / Late / Order /
 * Tracking / Cond are never force-hidden.
 *
 * Breakpoints are px widths of the LedgerGrid scrollport (16px rem assumed).
 */
/** Show all columns at/above this scrollport width; hide Qty below. */
const VIEWPORT_SHOW_ALL_PX = 640;

export function ordersQueueViewportForceHidden(widthPx: number): ReadonlySet<OrdersQueueColumnKey> {
  if (!Number.isFinite(widthPx) || widthPx >= VIEWPORT_SHOW_ALL_PX) return new Set();
  return new Set<OrdersQueueColumnKey>(['qty']);
}

/** CSS custom property that overrides a column's track width (px), keyed by the
 *  column key. Set on the grid surface; header + rows + group summary inherit it. */
export const ordersQueueColVar = gridColVar;

/**
 * Canonical desktop grid template — one track per column, each driven by its
 * width CSS var with the default track as the fallback:
 *   `var(--cf-col-title, minmax(14rem, 1.6fr)) …`
 * so a drag-resized width overrides the default with ZERO template rebuild —
 * set the var once on the surface and every row reflows via CSS (no per-row
 * React state). Header, rows, and group summary share this exact string.
 * Column order is pinned to the layout SoT (no staff reorder).
 */
export function ordersQueueGridTemplate(): string {
  return gridTemplate(ORDERS_QUEUE_COLUMNS);
}

/**
 * Grid template straight from RESOLVED column models in display order
 * (visibility/mode-aware). This is what the header, rows, and group summary
 * use — they hold the mode's column list, so rebuilding against the default
 * canonical (which would drop TESTED-only columns) is wrong there.
 */
export function ordersQueueGridTemplateFor(
  columns: readonly OrdersQueueColumn[],
): string {
  return gridTemplate(columns);
}

/** Build the grid-surface style object that applies a persisted px-width map as
 *  the per-column CSS vars (a column absent from the map keeps its default track). */
export function ordersQueueColumnVars(
  widths: Readonly<Record<string, number>>,
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, px] of Object.entries(widths)) {
    if (Number.isFinite(px)) vars[ordersQueueColVar(key)] = `${px}px`;
  }
  return vars;
}

/**
 * Column keys that carry a drag-resize handle — resolved from the house rule
 * ({@link isGridColumnResizable}). Orders declares Product-only resize
 * (`resizable: true` on `title` only); every other track is locked.
 */
export const ORDERS_QUEUE_RESIZABLE_KEYS: readonly string[] = ORDERS_QUEUE_COLUMNS.filter(
  isGridColumnResizable,
).map((c) => c.key);

/**
 * The locked identity pane — **select · order · age · title** — one SoT for
 * two invariants:
 *   • **frozen**: pinned on the left while qty…tracking scroll horizontally;
 *   • **read-only in the collection map**: never mounts `LedgerCellEditor`
 *     (`GRID_IDENTITY_COLUMN_KEYS` / `isGridColumnInCellEditable` covers
 *     select · title; `order` + `age` are display-only by construction — no
 *     editor is wired to them).
 * Keeping freeze + editability identical is what keeps
 * {@link ordersQueueFrozenLeft}'s offset math valid.
 *
 * **Why this pane.** On a dispatch queue the order is the container and the scan
 * anchor; Late is the urgency fact that must stay beside it; Product is the
 * heavy secondary pick anchor and the sole resizable track (`_fill` absorbs
 * slack after Tracking). Sibling grids do NOT inherit this — each declares its
 * own pane via the model's `frozen` flag.
 *
 * Derived, never re-typed: `frozen` on the column model is the single
 * declaration, so the pane and its offset math cannot drift apart.
 */
export const ORDERS_QUEUE_LOCKED_KEYS: readonly string[] = gridFrozenKeys(ORDERS_QUEUE_COLUMNS);

/** Whether a column is part of the frozen (and immovable) identity pane. */
export function isOrdersQueueFrozen(key: string): boolean {
  return ORDERS_QUEUE_LOCKED_KEYS.includes(key);
}

/**
 * Sticky-left offset (CSS) for a frozen cell, bound to THIS surface's pane —
 * see {@link gridFrozenLeft}, which owns the row inset, the width vars, and the
 * length-valued fallback that ten hand-rolled copies of this got wrong.
 */
export function ordersQueueFrozenLeft(key: string): string {
  return gridFrozenLeft(ORDERS_QUEUE_COLUMNS, key);
}

/**
 * Thin aliases onto the LedgerGrid chrome SoT
 * (`@/design-system/components/grid` `ledgerGridCell` / `LEDGER_GRID_FROZEN_CELL`
 * / `ledgerGridRowShellClass`). Kept so Orders call sites and family layout
 * re-exports stay stable; new code should import the DS names directly.
 */
export const ORDERS_QUEUE_FROZEN_CELL = LEDGER_GRID_FROZEN_CELL;
export const ORDERS_QUEUE_CELL_INSET = LEDGER_GRID_CELL_INSET;
export const ordersQueueGridCell = ledgerGridCell;
export const ordersQueueRowShellClass = ledgerGridRowShellClass;
export const ordersQueueGridWidthVarValue = ledgerGridWidthVarValue;

/** Legacy two-zone shell — Shipped / Receiving / walk-in. */
export function dashboardOrderRowShellClass(isMobile: boolean): string {
  return isMobile
    ? 'flex flex-col gap-1.5'
    : 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2';
}

export function dashboardOrderRowChipsClass(isMobile: boolean): string {
  const base = 'flex shrink-0 flex-wrap items-center gap-0.5';
  return isMobile
    ? `${base} w-full justify-end`
    : `${base} justify-end pr-1`;
}
