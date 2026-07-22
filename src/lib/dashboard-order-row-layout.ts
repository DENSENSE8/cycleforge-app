/**
 * Dashboard / queue table row layout.
 *
 * Two desktop anatomies:
 *   • **legacy** (`dashboardOrderRowShellClass`) — title+meta stack left, chips right.
 *     Still used by Shipped / Receiving siblings.
 *   • **orders queue columns** (`ordersQueueRowShellClass`) — a Google-Sheets-like
 *     WMS grid where EVERY fact owns its own track so the sticky header label
 *     locks vertically to each cell:
 *       select · title · date · age · qty · cond · notes · platform · order · tracking
 *     One track per column — never a bundled "ids" mega-cell — so platform,
 *     order, and tracking headers each dock over their own values. The row drag
 *     grip lives ONLY in the sticky header (select-all context); rows carry the
 *     checkbox alone. Pipeline status dots live on the Product title (mobile) /
 *     hover tooltip — no dedicated status gutter (reclaims width for fact cols).
 *     Mobile still stacks for thumb scanning.
 *
 * Driven by UIMode `isMobile` — desktop mode always renders the chosen desktop
 * anatomy regardless of viewport width.
 */

import type { ColumnType } from '@/lib/tables/table-columns';

/** Sticky column header docks at the scrollport top; day bands sit beneath it. */
export const ORDERS_QUEUE_COL_HEADER_STICKY = 'top-0';
/** Day-band sticky offset — must match the column header’s rendered height (~36px).
 *  Used by Packed / board surfaces that still render {@link DateGroupHeader} bands.
 *  Pending Grid is flat (Date column per row) and does not pin day bands. */
export const ORDERS_QUEUE_DATE_STICKY = 'top-9';

/** Stable key set for the desktop orders-queue columns (scan order). */
export type OrdersQueueColumnKey =
  | 'select'
  | 'title'
  | 'date'
  | 'qty'
  | 'condition'
  | 'age'
  | 'stock'
  | 'platform'
  | 'order'
  | 'tracking';

/**
 * One column of the desktop orders-queue grid — the SoT that the grid template,
 * the sticky header (label + type glyph + per-column menu), and the body/group
 * cells all read, so a column's width, label, type, and hide-key live in ONE
 * place and can never drift apart.
 */
export interface OrdersQueueColumn {
  key: OrdersQueueColumnKey;
  /** Fixed CSS grid track width. Only `title` + `notes` flex (`minmax`). */
  width: string;
  /** Header label; omitted for the select control gutter (no label). */
  label?: string;
  /** Data-type → header glyph (Airtable-style); omitted for control gutters. */
  type?: ColumnType;
  /** The `TableColumnConfig` key this column hides under, when hideable. */
  hideKey?: string;
}

/**
 * Canonical column model, in strict scan order:
 *   select · title · date · age · qty · cond · stock · platform · order · tracking
 * Never mix `auto`/`fr` for the same slot across rows, or columns drift (the
 * uneven look the Sheets rewrite exists to kill). `order` hides under the legacy
 * `orderid` config key (the grid column is `order`; the hide-registry key is
 * `orderid`).
 *
 * **Date** = absolute civil ship-by (deadline → created fallback) — compact cell.
 * **Age** = relative urgency (`Nd` / lane age) with SLA tone — docks directly
 * after Date so when + how-late scan as one pair.
 * **Stock** = replenishment metrics (shortfall · status · PO), quiet-empty when
 * in stock. The old free-text `notes` column is retired — note / OOS presence
 * became corner indicators on the Product cell; its flex width funds this track.
 * **Platform** = fixed brand-icon track (no variable-width marketplace names).
 * `title` is the ONLY flex track — every other cell is as narrow as its widest
 * realistic value (purposeful-cell doctrine).
 */
export const ORDERS_QUEUE_COLUMNS: readonly OrdersQueueColumn[] = [
  { key: 'select', width: '2rem' },
  { key: 'title', width: 'minmax(12rem, 1.4fr)', label: 'Product', type: 'text' },
  // Fact columns sized for icon-only headers + cell values (no truncated labels).
  { key: 'date', width: '4.5rem', label: 'Ship by', type: 'date' },
  { key: 'age', width: '3.25rem', label: 'Age', type: 'date' },
  { key: 'qty', width: '3rem', label: 'Qty', type: 'number', hideKey: 'qty' },
  // Sized for the widest pill-dropdown value (`PARTS` / `L-NEW` + caret).
  { key: 'condition', width: '5.5rem', label: 'Cond', type: 'tag', hideKey: 'condition' },
  { key: 'stock', width: '5.5rem', label: 'Stock', type: 'number' },
  { key: 'platform', width: '3rem', label: 'Platform', type: 'external', hideKey: 'platform' },
  { key: 'order', width: '4rem', label: 'Order', type: 'id', hideKey: 'orderid' },
  { key: 'tracking', width: '4.75rem', label: 'Tracking', type: 'location', hideKey: 'tracking' },
] as const;

/** Fast lookup for a column's model by key. */
const ORDERS_QUEUE_COLUMN_BY_KEY = new Map<string, OrdersQueueColumn>(
  ORDERS_QUEUE_COLUMNS.map((c) => [c.key, c]),
);

/** CSS custom property that overrides a column's track width (px), keyed by the
 *  column key. Set on the grid surface; header + rows + group summary inherit it. */
export function ordersQueueColVar(key: string): string {
  return `--cf-col-${key}`;
}

/**
 * Sanitize a persisted per-staff column order into a full, safe key list:
 *   • locked keys (`select · title`) are forced to the front in canonical
 *     relative order — a stale/hostile persisted order can never displace them;
 *   • known movable keys keep their persisted relative order;
 *   • movable canonical keys missing from the persisted list are inserted at
 *     their canonical position (a new column ships where the SoT puts it);
 *   • unknown keys (e.g. the retired `notes`) are silently dropped.
 * `undefined` / empty → the canonical order.
 */
export function sanitizeOrdersQueueColumnOrder(
  order?: readonly string[] | null,
): OrdersQueueColumnKey[] {
  const canonical = ORDERS_QUEUE_COLUMNS.map((c) => c.key);
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
): OrdersQueueColumn[] {
  return sanitizeOrdersQueueColumnOrder(order).map(
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
  return orderedOrdersQueueColumns(order)
    .map((c) => `var(${ordersQueueColVar(c.key)}, ${c.width})`)
    .join(' ');
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

/** Column keys that carry a drag-resize handle — the labelled data columns; the
 *  select control gutter stays fixed. */
export const ORDERS_QUEUE_RESIZABLE_KEYS: readonly string[] = ORDERS_QUEUE_COLUMNS.filter(
  (c) => c.key !== 'select',
).map((c) => c.key);

/**
 * The locked identity pane — select · title — one SoT for BOTH invariants:
 *   • **frozen**: pinned on the left while date…tracking scroll horizontally;
 *   • **immovable**: never drag-reorderable, and no other column may cross it
 *     (AG Grid `lockPosition` semantics; Airtable primary-field precedent).
 * Keeping the two sets identical is what keeps {@link ordersQueueFrozenLeft}'s
 * offset math valid under any persisted order.
 */
export const ORDERS_QUEUE_LOCKED_KEYS: readonly string[] = ['select', 'title'];

/** Whether a column is part of the frozen (and immovable) identity pane. */
export function isOrdersQueueFrozen(key: string): boolean {
  return ORDERS_QUEUE_LOCKED_KEYS.includes(key);
}

/**
 * The row's own left inset (`QUEUE_ROW.px` = `px-3`, density-aware) — the frozen
 * pane must include it or every pinned cell drifts left by that amount when the
 * body scrolls (the grid content starts *inside* the row padding).
 *
 * Pending Grid skin sets `--cf-queue-row-px: 0px` on `[data-grid-skin]` so frozen
 * cells flush to the shell edge (row chrome padding is zeroed under the skin).
 */
const ORDERS_QUEUE_ROW_PX = 'var(--cf-queue-row-px, calc(0.75rem * var(--cf-density, 1)))';

/**
 * Sticky-left offset (CSS) for a frozen cell — the row's left inset plus the sum
 * of the width vars of the frozen columns *before* it (select → px; title → px
 * + select), so the pane stays pinned exactly on
 * its column origin even as those columns resize or density changes.
 */
export function ordersQueueFrozenLeft(key: string): string {
  const idx = ORDERS_QUEUE_LOCKED_KEYS.indexOf(key);
  const parts = [ORDERS_QUEUE_ROW_PX];
  for (const k of ORDERS_QUEUE_LOCKED_KEYS.slice(0, Math.max(0, idx))) {
    const col = ORDERS_QUEUE_COLUMNS.find((c) => c.key === k);
    parts.push(`var(${ordersQueueColVar(k)}, ${col?.width ?? '0px'})`);
  }
  return `calc(${parts.join(' + ')})`;
}

/**
 * Chrome that pins a frozen cell during horizontal scroll — sticky position, a z
 * above the scrolling cells, and the row's own background (via `inherit`) so
 * selection / zebra paint through the pinned pane. The sticky column-header
 * band itself is opaque (`[data-grid-col-header]`) so virtualized rows never
 * bleed under it. Compose with {@link ordersQueueGridCell}; set the `left`
 * offset from {@link ordersQueueFrozenLeft} in `style`. The `title` frozen edge
 * also carries `data-frozen-edge` so a scroll shadow can hang off it
 * (see `.cf-grid-scrolled`).
 */
export const ORDERS_QUEUE_FROZEN_CELL = 'sticky z-raised bg-inherit';

/**
 * Horizontal (+ optional vertical) cell inset for the orders-queue grid.
 *
 * A Tier-1 density-aware scale step, deliberately NOT an `inset-*` intent: every
 * intent also sets `paddingBlock`, which would fight the density-owned row height
 * on the board. Horizontal inset is the whole cell padding story on the board
 * (`'cell'`). Under Pending Grid skin, use `'grid'` so **cells** own both axes of
 * padding while the row shell stays `p-0` — vertical borders then span full row
 * height and meet at corners (Employees-style connected ledger).
 */
export const ORDERS_QUEUE_CELL_INSET = 'px-2';
/** Grid-skin cell pad — horizontal + vertical so row shell can be `p-0`. */
const ORDERS_QUEUE_GRID_CELL_INSET = 'px-2 py-1.5';

/**
 * Per-column cell chrome shared by the sticky header, every row, and the
 * multi-product group summary — the one helper that makes the queue read as a
 * continuous spreadsheet grid (Airtable/Sheets), not a hairline list.
 *
 * Composes three things so header ↔ body ↔ group rules can never drift:
 *   • `flex items-center` — the cell fills the stretched track height (the shell
 *     is `items-stretch`) and vertically centers its content, so every column
 *     rule spans the full row height uniformly.
 *   • horizontal inset ({@link ORDERS_QUEUE_CELL_INSET}) — content never kisses
 *     the rule. Suppressed on the narrow select control gutter.
 *   • a right hairline (`border-r border-border-hairline`) — the vertical column
 *     rule. Dropped on the last column and the lead select gutter.
 *
 * @param rule  draw the right column rule (default true).
 * @param inset `'cell'` board default · `'grid'` skin (px+py) · `'none'` gutters.
 */
export function ordersQueueGridCell(
  { rule = true, inset = 'cell' }: { rule?: boolean; inset?: 'cell' | 'grid' | 'none' } = {},
): string {
  return [
    'flex min-w-0 items-center self-stretch',
    inset === 'cell' ? ORDERS_QUEUE_CELL_INSET : inset === 'grid' ? ORDERS_QUEUE_GRID_CELL_INSET : '',
    rule ? 'border-r border-border-hairline' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Desktop columnar shell (orders queue + station rows that share it).
 *
 * `items-stretch` (was `items-center`) so every grid cell fills the row height
 * and its {@link ordersQueueGridCell} right hairline runs the full height — a
 * continuous vertical rule, not a ragged content-height stub. The old `gap-x-2`
 * is gone: cells butt together and the per-cell inset + rule (from the helper)
 * own the inter-column spacing, the way a spreadsheet does.
 */
export function ordersQueueRowShellClass(isMobile: boolean): string {
  return isMobile
    ? 'flex flex-col gap-1.5'
    : 'grid w-full min-w-0 items-stretch';
}

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
