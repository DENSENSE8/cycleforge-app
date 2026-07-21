/**
 * Dashboard / queue table row layout.
 *
 * Two desktop anatomies:
 *   • **legacy** (`dashboardOrderRowShellClass`) — title+meta stack left, chips right.
 *     Still used by Shipped / Receiving siblings.
 *   • **orders queue columns** (`ordersQueueRowShellClass`) — a Google-Sheets-like
 *     WMS grid where EVERY fact owns its own track so the sticky header label
 *     locks vertically to each cell:
 *       select · status · title · qty · cond · age · notes · platform · order · tracking
 *     One track per column — never a bundled "ids" mega-cell — so platform,
 *     order, and tracking headers each dock over their own values. The row drag
 *     grip lives ONLY in the sticky header (select-all context); rows carry the
 *     checkbox alone. Mobile still stacks for thumb scanning.
 *
 * Driven by UIMode `isMobile` — desktop mode always renders the chosen desktop
 * anatomy regardless of viewport width.
 */

import type { ColumnType } from '@/lib/tables/table-columns';

/** Sticky column header docks at the scrollport top; day bands sit beneath it. */
export const ORDERS_QUEUE_COL_HEADER_STICKY = 'top-0';
/** Day-band sticky offset — must match the column header’s rendered height (~36px). */
export const ORDERS_QUEUE_DATE_STICKY = 'top-9';

/** Stable key set for the desktop orders-queue columns (scan order). */
export type OrdersQueueColumnKey =
  | 'select'
  | 'status'
  | 'title'
  | 'qty'
  | 'condition'
  | 'age'
  | 'notes'
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
  /** Header label; omitted for the select/status control gutters (no label). */
  label?: string;
  /** Data-type → header glyph (Airtable-style); omitted for control gutters. */
  type?: ColumnType;
  /** The `TableColumnConfig` key this column hides under, when hideable. */
  hideKey?: string;
}

/**
 * Canonical column model, in strict scan order:
 *   select · status · title · qty · cond · age · notes · platform · order · tracking
 * Never mix `auto`/`fr` for the same slot across rows, or columns drift (the
 * uneven look the Sheets rewrite exists to kill). `order` hides under the legacy
 * `orderid` config key (the grid column is `order`; the hide-registry key is
 * `orderid`).
 */
export const ORDERS_QUEUE_COLUMNS: readonly OrdersQueueColumn[] = [
  { key: 'select', width: '2rem' },
  { key: 'status', width: '1.25rem' },
  { key: 'title', width: 'minmax(14rem, 1.6fr)', label: 'Product', type: 'text' },
  // Fact columns sized to fit FULL labels (Qty / Cond / Age / Platform / Order /
  // Tracking) without ellipsis — industry default: never truncate the header.
  { key: 'qty', width: '3.25rem', label: 'Qty', type: 'number', hideKey: 'qty' },
  { key: 'condition', width: '4.5rem', label: 'Cond', type: 'tag', hideKey: 'condition' },
  { key: 'age', width: '3.5rem', label: 'Age', type: 'date' },
  { key: 'notes', width: 'minmax(6rem, 0.7fr)', label: 'Notes', type: 'longtext' },
  { key: 'platform', width: '6.75rem', label: 'Platform', type: 'external', hideKey: 'platform' },
  { key: 'order', width: '4.5rem', label: 'Order', type: 'id', hideKey: 'orderid' },
  { key: 'tracking', width: '5.75rem', label: 'Tracking', type: 'location', hideKey: 'tracking' },
] as const;

/** CSS custom property that overrides a column's track width (px), keyed by the
 *  column key. Set on the grid surface; header + rows + group summary inherit it. */
export function ordersQueueColVar(key: string): string {
  return `--cf-col-${key}`;
}

/**
 * Canonical desktop grid template — one track per column, each driven by its
 * width CSS var with the default track as the fallback:
 *   `var(--cf-col-title, minmax(14rem, 1.6fr)) …`
 * so a persisted / drag-resized width overrides the default with ZERO template
 * rebuild — set the var once on the surface and every row reflows via CSS (no
 * per-row React state). Header, rows, and group summary share this exact string.
 */
export function ordersQueueGridTemplate(): string {
  return ORDERS_QUEUE_COLUMNS.map((c) => `var(${ordersQueueColVar(c.key)}, ${c.width})`).join(' ');
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
 *  select/status control gutters stay fixed. */
export const ORDERS_QUEUE_RESIZABLE_KEYS: readonly string[] = ORDERS_QUEUE_COLUMNS.filter(
  (c) => c.key !== 'select' && c.key !== 'status',
).map((c) => c.key);

/**
 * The frozen identity pane — select · status · title — pinned on the left while
 * qty…tracking scroll horizontally (once resized columns push the total past the
 * viewport). In grid order.
 */
const ORDERS_QUEUE_FROZEN_KEYS: readonly string[] = ['select', 'status', 'title'];

/** Whether a column is part of the frozen identity pane. */
export function isOrdersQueueFrozen(key: string): boolean {
  return ORDERS_QUEUE_FROZEN_KEYS.includes(key);
}

/**
 * The row's own left inset (`QUEUE_ROW.px` = `px-3`, density-aware) — the frozen
 * pane must include it or every pinned cell drifts left by that amount when the
 * body scrolls (the grid content starts *inside* the row padding).
 */
const ORDERS_QUEUE_ROW_PX = 'calc(0.75rem * var(--cf-density, 1))';

/**
 * Sticky-left offset (CSS) for a frozen cell — the row's left inset plus the sum
 * of the width vars of the frozen columns *before* it (select → px; status → px
 * + select; title → px + select + status), so the pane stays pinned exactly on
 * its column origin even as those columns resize or density changes.
 */
export function ordersQueueFrozenLeft(key: string): string {
  const idx = ORDERS_QUEUE_FROZEN_KEYS.indexOf(key);
  const parts = [ORDERS_QUEUE_ROW_PX];
  for (const k of ORDERS_QUEUE_FROZEN_KEYS.slice(0, Math.max(0, idx))) {
    const col = ORDERS_QUEUE_COLUMNS.find((c) => c.key === k);
    parts.push(`var(${ordersQueueColVar(k)}, ${col?.width ?? '0px'})`);
  }
  return `calc(${parts.join(' + ')})`;
}

/**
 * Chrome that pins a frozen cell during horizontal scroll — sticky position, a z
 * above the scrolling cells, and the row's own background (via `inherit`) so the
 * scrolling fact cells don't bleed through the pinned pane. Compose with
 * {@link ordersQueueGridCell}; set the `left` offset from {@link ordersQueueFrozenLeft}
 * in `style`. The `title` frozen edge also carries `data-frozen-edge` so a scroll
 * shadow can hang off it (see `.cf-grid-scrolled`).
 */
export const ORDERS_QUEUE_FROZEN_CELL = 'sticky z-raised bg-inherit';

/**
 * Horizontal cell inset for the orders-queue grid.
 *
 * A Tier-1 density-aware scale step, deliberately NOT an `inset-*` intent: every
 * intent also sets `paddingBlock`, which would fight the density-owned row height
 * (the row's `py` / the Phase-5 row-height presets). Horizontal inset is the
 * whole cell padding story here, so it stays a single centralized token instead
 * of a scattered `px-2`. Guard-safe: the spacing guard bans only arbitrary-px.
 */
export const ORDERS_QUEUE_CELL_INSET = 'px-2';

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
 *     the rule. Suppressed on the narrow select/status control gutters.
 *   • a right hairline (`border-r border-border-hairline`) — the vertical column
 *     rule. Dropped on the last column and the lead select gutter.
 *
 * @param rule  draw the right column rule (default true).
 * @param inset horizontal inset (default `'cell'`; `'none'` for control gutters).
 */
export function ordersQueueGridCell(
  { rule = true, inset = 'cell' }: { rule?: boolean; inset?: 'cell' | 'none' } = {},
): string {
  return [
    'flex min-w-0 items-center',
    inset === 'cell' ? ORDERS_QUEUE_CELL_INSET : '',
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
