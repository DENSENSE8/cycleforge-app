/**
 * Dashboard / queue table row layout.
 *
 * Desktop anatomies:
 *   • **legacy** (`dashboardOrderRowShellClass`) — title+meta stack left, chips right.
 *     Mobile fallback + pipeline board lanes + Tech/Packer week rows still use this.
 *   • **orders queue columns** (`ordersQueueRowShellClass`) — Google-Sheets-like
 *     WMS grid (Outbound Pending · Tested · Packed · Labels · Staged · Shipped · Review):
 *       select · order · title · ship-by · cond · qty · tracking
 *     (frozen identity pane = select · order · title)
 *       (Tested tab: tester · testedAt insert after ship-by)
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

/** Sticky column header docks at the scrollport top. */
export const ORDERS_QUEUE_COL_HEADER_STICKY = 'top-0';

/** Stable key set for the desktop orders-queue columns (scan order). */
export type OrdersQueueColumnKey =
  | 'select'
  | 'title'
  /** Fused ship-by commitment + lateness. Replaced the `date` + `age` pair. */
  | 'sla'
  | 'qty'
  | 'condition'
  | 'status'
  | 'tester'
  | 'testedAt'
  | 'platform'
  | 'order'
  | 'tracking';

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
 * they never shrink below cell content, `title` is the only flex track, and a
 * track narrower than its `labelFitRem` degrades to glyph + `sr-only` rather
 * than a truncated word.
 */
export interface OrdersQueueColumn extends Omit<LedgerGridColumnModel, 'key'> {
  key: OrdersQueueColumnKey;
}

/**
 * Canonical Pending-tab column model, in strict scan order:
 *   select · order · title · ship-by · cond · qty · tracking
 * Never mix `auto`/`fr` for the same slot across rows, or columns drift (the
 * uneven look the Sheets rewrite exists to kill).
 *
 * **Order** (`order`) is the lead identity track, not a fact column: it is the
 * container the operator scans a dispatch queue by, so it is frozen beside
 * select/title and carries **no `hideKey`** — the Fields menu can never take
 * the row's identity away. (It previously hid under the legacy `orderid` key;
 * a persisted `hidden: ['orderid']` delta is now inert, because
 * `isGridColumnVisible` short-circuits on a missing `hideKey`. That is the
 * whole migration — no pref rewrite needed.)
 *
 * **Ship by** (`sla`) = the fused commitment cell: absolute civil ship-by
 * (deadline → created fallback) **and** relative urgency (`Nd` / lane age) with
 * SLA tone, in one track. They were adjacent columns answering one operator
 * question ("when is this due, and how late is it") and sorted on effectively
 * the same key, so the pair cost a track and a header (the unreadable `BY`)
 * while forcing a cross-column scan. Fusing frees that width for real labels.
 * The cell is **date-only** — see {@link GridSlaCellValue} for why there is no
 * time-of-day here.
 * Status + Platform columns retired — lifecycle tabs (Pending · Tested) own the
 * lane; listing open stays on the product-cell hover link.
 * The old free-text `notes` column and the replenishment `stock` column are
 * retired — note / OOS presence live as corner indicators on the Product cell
 * (replenishment facts surface in the OOS indicator tooltip); their widths fund
 * the flex title track.
 * Fact tracks are content-hard `minmax(X,X)`; `title` is the ONLY flex track.
 */
export const ORDERS_QUEUE_COLUMNS: readonly OrdersQueueColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', frozen: true },
  // `align: 'start'` is the declared exception to `ALIGN_BY_TYPE.id` (ruled
  // 2026-08-02): an ORDER number is the row's own transaction identity — a name
  // you read, and the first thing scanned on an order-anchored surface — not a
  // magnitude compared down the column. A catalog SKU / serial / ticket stays
  // end-aligned, which is why this is an override here and never a change to
  // the type map. See `source-of-truth.md` → Grid column justification.
  { key: 'order', width: 'minmax(4.5rem, 4.5rem)', label: 'Order', type: 'id', align: 'start', frozen: true, labelFitRem: 4.5 },
  { key: 'title', width: 'minmax(12rem, 1fr)', label: 'Product', type: 'text', frozen: true, labelFitRem: 8 },
  // Every fact track is sized to fit its own short label, so the default view
  // shows words rather than glyphs. `labelFitRem` stays as the graceful
  // degrade for a column the operator drag-resizes narrower than its label.
  { key: 'sla', width: 'minmax(7rem, 7rem)', label: 'Ship by', type: 'date', labelFitRem: 5 },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', label: 'Cond', type: 'tag', hideKey: 'condition', labelFitRem: 4 },
  { key: 'qty', width: 'minmax(3.5rem, 3.5rem)', label: 'Qty', type: 'number', hideKey: 'qty', labelFitRem: 3.5 },
  { key: 'tracking', width: 'minmax(5rem, 5rem)', label: 'Tracking', gridLabel: 'Track', type: 'tracking', hideKey: 'tracking', labelFitRem: 4.5 },
] as const;

/**
 * TESTED-tab column model (`?tested` / fulfillment.tested): every row is TESTED,
 * so the lane surfaces **who tested** + **when** instead of a redundant Status
 * pill — Tester docks after Ship by (the "who · when" pair reads beside the
 * urgency cluster). Field contract (plan §9): tester name resolves
 * `tested_by_name → tester_name → getStaffName(id)` via `normalizePersonName`;
 * tested-at prefers `test_date_time` then `test_activity_at`, ignores the legacy
 * `'1'` sentinel, formats via `formatDateTimePST`.
 */
export const ORDERS_QUEUE_TESTED_COLUMNS: readonly OrdersQueueColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', frozen: true },
  // `align: 'start'` is the declared exception to `ALIGN_BY_TYPE.id` (ruled
  // 2026-08-02): an ORDER number is the row's own transaction identity — a name
  // you read, and the first thing scanned on an order-anchored surface — not a
  // magnitude compared down the column. A catalog SKU / serial / ticket stays
  // end-aligned, which is why this is an override here and never a change to
  // the type map. See `source-of-truth.md` → Grid column justification.
  { key: 'order', width: 'minmax(4.5rem, 4.5rem)', label: 'Order', type: 'id', align: 'start', frozen: true, labelFitRem: 4.5 },
  { key: 'title', width: 'minmax(12rem, 1fr)', label: 'Product', type: 'text', frozen: true, labelFitRem: 8 },
  { key: 'sla', width: 'minmax(7rem, 7rem)', label: 'Ship by', type: 'date', labelFitRem: 5 },
  { key: 'tester', width: 'minmax(6rem, 6rem)', label: 'Tester', type: 'text', labelFitRem: 4.5 },
  // Full `formatDateTimePST` string (MM/DD/YYYY h:mm:ss AM/PM) needs the widest track.
  { key: 'testedAt', width: 'minmax(10rem, 10rem)', label: 'Tested at', type: 'date', labelFitRem: 4.5 },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', label: 'Cond', type: 'tag', hideKey: 'condition', labelFitRem: 4 },
  { key: 'qty', width: 'minmax(3.5rem, 3.5rem)', label: 'Qty', type: 'number', hideKey: 'qty', labelFitRem: 3.5 },
  { key: 'tracking', width: 'minmax(5rem, 5rem)', label: 'Tracking', gridLabel: 'Track', type: 'tracking', hideKey: 'tracking', labelFitRem: 4.5 },
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
 * force-hide secondary columns in order Qty → Cond. Ephemeral — not written to
 * staff prefs.
 *
 * **`sla` is protected and must stay that way.** The old order dropped `date`
 * first, which was safe only because `age` still carried the urgency fact one
 * track over. Now that the two are fused, dropping `sla` would take the
 * deadline AND the lateness off a dispatch queue at exactly the width where
 * the operator is most likely on a small screen. Title / SLA / Order /
 * Tracking are never force-hidden.
 *
 * Breakpoints are px widths of the LedgerGrid scrollport (16px rem assumed),
 * each stepped down by the one collapse stage the fusion removed.
 */
const ORDERS_QUEUE_VIEWPORT_COLLAPSE_ORDER: readonly OrdersQueueColumnKey[] = [
  'qty',
  'condition',
] as const;

/** Show all columns at/above this scrollport width. */
const VIEWPORT_SHOW_ALL_PX = 640;
/** Hide Qty below this. */
const VIEWPORT_HIDE_QTY_PX = 560;

export function ordersQueueViewportForceHidden(widthPx: number): ReadonlySet<OrdersQueueColumnKey> {
  if (!Number.isFinite(widthPx) || widthPx >= VIEWPORT_SHOW_ALL_PX) return new Set();
  if (widthPx >= VIEWPORT_HIDE_QTY_PX) {
    return new Set<OrdersQueueColumnKey>(ORDERS_QUEUE_VIEWPORT_COLLAPSE_ORDER.slice(0, 1));
  }
  return new Set<OrdersQueueColumnKey>(ORDERS_QUEUE_VIEWPORT_COLLAPSE_ORDER);
}

/** Fast lookup for a column's model by key (both modes; keys shared across
 *  modes resolve to the default-model entry — identical geometry by design). */
const ORDERS_QUEUE_COLUMN_BY_KEY = new Map<string, OrdersQueueColumn>(
  [...ORDERS_QUEUE_TESTED_COLUMNS, ...ORDERS_QUEUE_COLUMNS].map((c) => [c.key, c]),
);

/** CSS custom property that overrides a column's track width (px), keyed by the
 *  column key. Set on the grid surface; header + rows + group summary inherit it. */
export const ordersQueueColVar = gridColVar;

/**
 * Sanitize a persisted per-staff column order into a full, safe key list:
 *   • locked keys (the frozen identity pane) are forced to the front in canonical
 *     relative order — a stale/hostile persisted order can never displace them;
 *   • known movable keys keep their persisted relative order;
 *   • movable canonical keys missing from the persisted list are inserted at
 *     their canonical position (a new column ships where the SoT puts it);
 *   • unknown keys (e.g. the retired `notes` / `stock`) are silently dropped.
 * `undefined` / empty → the canonical order.
 */
export function sanitizeOrdersQueueColumnOrder(
  order?: readonly string[] | null,
  canonicalColumns: readonly OrdersQueueColumn[] = ORDERS_QUEUE_COLUMNS,
): OrdersQueueColumnKey[] {
  const canonical = canonicalColumns.map((c) => c.key);
  const locked = canonical.filter((k) => ORDERS_QUEUE_LOCKED_KEYS.includes(k));
  const movableCanonical = canonical.filter((k) => !ORDERS_QUEUE_LOCKED_KEYS.includes(k));
  const seen = new Set<string>();
  const movable: OrdersQueueColumnKey[] = [];
  for (const key of order ?? []) {
    if (!seen.has(key) && (movableCanonical as string[]).includes(key)) {
      seen.add(key);
      movable.push(key as OrdersQueueColumnKey);
    }
  }
  movableCanonical.forEach((key, canonicalIdx) => {
    if (!seen.has(key)) {
      seen.add(key);
      movable.splice(Math.min(canonicalIdx, movable.length), 0, key);
    }
  });
  return [...locked, ...movable];
}

/** The full column models in a (sanitized) display order. No order → canonical. */
export function orderedOrdersQueueColumns(
  order?: readonly string[] | null,
  canonicalColumns: readonly OrdersQueueColumn[] = ORDERS_QUEUE_COLUMNS,
): OrdersQueueColumn[] {
  return sanitizeOrdersQueueColumnOrder(order, canonicalColumns).map(
    (key) => ORDERS_QUEUE_COLUMN_BY_KEY.get(key) as OrdersQueueColumn,
  );
}

/**
 * Canonical desktop grid template — one track per column, each driven by its
 * width CSS var with the default track as the fallback:
 *   `var(--cf-col-title, minmax(14rem, 1.6fr)) …`
 * so a persisted / drag-resized width overrides the default with ZERO template
 * rebuild — set the var once on the surface and every row reflows via CSS (no
 * per-row React state). Header, rows, and group summary share this exact string.
 * Pass a persisted per-staff `order` to get the same template in that
 * (sanitized) column order — header + body + summary must all pass the SAME
 * order or the tracks disagree.
 */
export function ordersQueueGridTemplate(order?: readonly string[] | null): string {
  return gridTemplate(orderedOrdersQueueColumns(order));
}

/**
 * Grid template straight from RESOLVED column models in display order (already
 * sanitized/mode-aware). This is what the header, rows, and group summary use —
 * they hold the mode's column list, so re-sanitizing keys against the default
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
 * ({@link isGridColumnResizable}). `number` stays fixed; identifier/`location`
 * tracks (`order` · `tracking`) are Sheets-parity resizable (2026-08).
 */
export const ORDERS_QUEUE_RESIZABLE_KEYS: readonly string[] = ORDERS_QUEUE_COLUMNS.filter(
  isGridColumnResizable,
).map((c) => c.key);

/**
 * The locked identity pane — **select · order · title** — one SoT for THREE
 * invariants:
 *   • **frozen**: pinned on the left while ship-by…tracking scroll horizontally;
 *   • **immovable**: never drag-reorderable, and no other column may cross it
 *     (AG Grid `lockPosition` semantics; Airtable primary-field precedent);
 *   • **read-only in the collection map**: never mounts `LedgerCellEditor`
 *     (`GRID_IDENTITY_COLUMN_KEYS` / `isGridColumnInCellEditable` covers
 *     select · title; `order` is display-only by construction — no editor is
 *     wired to it).
 * Keeping freeze + lock + editability identical is what keeps
 * {@link ordersQueueFrozenLeft}'s offset math valid under any persisted order.
 *
 * **Why `order` joins the house `select · title` default here.** On a dispatch
 * queue the order is the container and the scan anchor — it is what the
 * operator reads off a pick list, a label, or a customer email, and every
 * outbound/OMS console (Shopify Admin, ShipStation) pins it first. The product
 * title is the heavy secondary anchor for the physical pick, so it keeps the
 * flex track immediately after. Sibling grids do NOT inherit this: Catalog has
 * no order context, and on Receiving/Incoming the PO is secondary to the item
 * being scanned — each declares its own pane via the model's `frozen` flag.
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
