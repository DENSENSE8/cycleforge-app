/**
 * Dashboard / queue table row layout.
 *
 * Desktop anatomies:
 *   • **legacy** (`dashboardOrderRowShellClass`) — title+meta stack left, chips right.
 *     Mobile fallback + pipeline board lanes + Tech/Packer week rows still use this.
 *   • **orders queue columns** (`ordersQueueRowShellClass`) — Google-Sheets-like
 *     WMS grid (Outbound Pending · Tested · Packed · Labels · Staged · Shipped · Review):
 *       select · title · date · age · qty · cond · order · tracking
 *       (Tested tab: status demoted → tester · testedAt after age)
 *   • **Incoming columns** (`INCOMING_GRID_COLUMNS`) — LedgerGrid for `/incoming`:
 *       select · title · date · age · qty · cond · status · platform · order · tracking
 *   • **Receiving browse columns** (`RECEIVING_GRID_COLUMNS`) — LedgerGrid for
 *     Unbox / History / Testing: select · title · qty · cond · stage · platform ·
 *     order · tracking · serial
 *
 * Driven by UIMode `isMobile` — desktop mode always renders the chosen desktop
 * anatomy regardless of viewport width.
 */

import type { ColumnType } from '@/lib/tables/table-columns';

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
 */
export interface OrdersQueueColumn {
  key: OrdersQueueColumnKey;
  /**
   * CSS grid track. Fact columns use `minmax(X, X)` so they never shrink below
   * cell content (Airtable/AG Grid). Only `title` flexes (`minmax(12rem, 1fr)`).
   */
  width: string;
  /** Header label; omitted for the select control gutter (no label). */
  label?: string;
  /**
   * Compact header text for the Pending grid skin when the track is wide enough
   * ({@link labelFitRem}). Full {@link label} stays in the tooltip / board header.
   */
  gridLabel?: string;
  /**
   * Pending grid: show {@link gridLabel} (or `label`) beside the type glyph when
   * the track’s rem floor is ≥ this value; otherwise glyph + sr-only + tooltip
   * (never truncated `A…`). Default 4.5.
   */
  labelFitRem?: number;
  /** Data-type → header glyph (Airtable-style); omitted for control gutters. */
  type?: ColumnType;
  /** The `TableColumnConfig` key this column hides under, when hideable. */
  hideKey?: string;
}

/**
 * Canonical Pending-tab column model, in strict scan order:
 *   select · title · date · age · qty · cond · order · tracking
 * Never mix `auto`/`fr` for the same slot across rows, or columns drift (the
 * uneven look the Sheets rewrite exists to kill). `order` hides under the legacy
 * `orderid` config key (the grid column is `order`; the hide-registry key is
 * `orderid`).
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
  { key: 'select', width: 'minmax(2rem, 2rem)' },
  { key: 'title', width: 'minmax(12rem, 1fr)', label: 'Product', type: 'text', labelFitRem: 8 },
  // Every fact track is sized to fit its own short label, so the default view
  // shows words rather than glyphs. `labelFitRem` stays as the graceful
  // degrade for a column the operator drag-resizes narrower than its label.
  { key: 'sla', width: 'minmax(7rem, 7rem)', label: 'Ship by', type: 'date', labelFitRem: 5 },
  { key: 'qty', width: 'minmax(3.5rem, 3.5rem)', label: 'Qty', type: 'number', hideKey: 'qty', labelFitRem: 3.5 },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', label: 'Cond', type: 'tag', hideKey: 'condition', labelFitRem: 4 },
  { key: 'order', width: 'minmax(4.5rem, 4.5rem)', label: 'Order', type: 'id', hideKey: 'orderid', labelFitRem: 4.5 },
  { key: 'tracking', width: 'minmax(5rem, 5rem)', label: 'Tracking', gridLabel: 'Track', type: 'location', hideKey: 'tracking', labelFitRem: 4.5 },
] as const;

/**
 * TESTED-tab column model (`?tested` / fulfillment.tested): every row is TESTED,
 * so the lane surfaces **who tested** + **when** instead of a redundant Status
 * pill — Tester docks after Age (the "who · when" pair reads beside the urgency
 * cluster). Field contract (plan §9): tester name resolves
 * `tested_by_name → tester_name → getStaffName(id)` via `normalizePersonName`;
 * tested-at prefers `test_date_time` then `test_activity_at`, ignores the legacy
 * `'1'` sentinel, formats via `formatDateTimePST`.
 */
export const ORDERS_QUEUE_TESTED_COLUMNS: readonly OrdersQueueColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)' },
  { key: 'title', width: 'minmax(12rem, 1fr)', label: 'Product', type: 'text', labelFitRem: 8 },
  { key: 'sla', width: 'minmax(7rem, 7rem)', label: 'Ship by', type: 'date', labelFitRem: 5 },
  { key: 'tester', width: 'minmax(6rem, 6rem)', label: 'Tester', type: 'text', labelFitRem: 4.5 },
  // Full `formatDateTimePST` string (MM/DD/YYYY h:mm:ss AM/PM) needs the widest track.
  { key: 'testedAt', width: 'minmax(10rem, 10rem)', label: 'Tested at', type: 'date', labelFitRem: 4.5 },
  { key: 'qty', width: 'minmax(3.5rem, 3.5rem)', label: 'Qty', type: 'number', hideKey: 'qty', labelFitRem: 3.5 },
  { key: 'condition', width: 'minmax(5.5rem, 5.5rem)', label: 'Cond', type: 'tag', hideKey: 'condition', labelFitRem: 4 },
  { key: 'order', width: 'minmax(4.5rem, 4.5rem)', label: 'Order', type: 'id', hideKey: 'orderid', labelFitRem: 4.5 },
  { key: 'tracking', width: 'minmax(5rem, 5rem)', label: 'Tracking', gridLabel: 'Track', type: 'location', hideKey: 'tracking', labelFitRem: 4.5 },
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
export function ordersQueueColumnTrackRem(column: OrdersQueueColumn): number {
  const m = column.width.match(/([\d.]+)rem/);
  return m ? Number(m[1]) : 12;
}

/** Pending grid: whether the header should paint a visible short label (vs glyph-only). */
export function ordersQueueHeaderShowsLabel(column: OrdersQueueColumn): boolean {
  const fit = column.labelFitRem ?? 4.5;
  return ordersQueueColumnTrackRem(column) >= fit;
}

/**
 * Sum of content-min rem floors for the given columns (or canonical set).
 * Applied as `minWidth` on gridSkin header/rows so h-scroll activates instead of
 * crushing fact tracks into the viewport.
 */
export function ordersQueueContentMinWidthRem(
  columns: readonly OrdersQueueColumn[] = ORDERS_QUEUE_COLUMNS,
): number {
  return columns.reduce((sum, c) => sum + ordersQueueColumnTrackRem(c), 0);
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
  return orderedOrdersQueueColumns(order)
    .map((c) => `var(${ordersQueueColVar(c.key)}, ${c.width})`)
    .join(' ');
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
  return columns.map((c) => `var(${ordersQueueColVar(c.key)}, ${c.width})`).join(' ');
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
 *
 * `scrollMinContent` (Pending / LedgerGrid `scrollX`): every virtualized row
 * shares ONE width via `--cf-orders-grid-w` (published on the scrollport as
 * `max(100%, <content-min>rem)`). Never `w-max` per row — that let long Product
 * titles widen some rows and shove fact columns out of vertical lock.
 */
export function ordersQueueRowShellClass(
  isMobile: boolean,
  opts?: { scrollMinContent?: boolean },
): string {
  return isMobile
    ? 'flex flex-col gap-1.5'
    : [
        'grid items-stretch',
        opts?.scrollMinContent
          ? 'w-[var(--cf-orders-grid-w)] min-w-[var(--cf-orders-grid-w)]'
          : 'w-full min-w-0',
      ].join(' ');
}

/** CSS custom property: shared row/header width under LedgerGrid `scrollX`. */
export const ORDERS_QUEUE_GRID_WIDTH_VAR = '--cf-orders-grid-w';

/** Value for {@link ORDERS_QUEUE_GRID_WIDTH_VAR}: fill the scrollport, or content-min if wider. */
export function ordersQueueGridWidthVarValue(contentMinWidthRem: number): string {
  return `max(100%, ${contentMinWidthRem}rem)`;
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
