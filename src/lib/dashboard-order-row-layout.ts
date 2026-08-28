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

import { compoundColumnsFor } from '@/components/tables/compound/compound-columns';
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
  /** Compound (two-row) presentation tracks — see {@link ORDERS_COMPOUND_COLUMNS}. */
  | 'thumb'
  | 'item'
  | 'fulfillment'
  | 'state'
  | 'amount'
  | 'actions'
  | 'title'
  /** Derived days past ship-by (`0d` / `3d` / …). Replaced fused `sla` / `date`. */
  | 'age'
  | 'condition'
  | 'qty'
  | 'tester'
  | 'testedAt'
  | 'packer'
  | 'packedAt'
  | 'packStation'
  /** In-warehouse lifecycle stage (awaiting test / tested / packed / blocked). */
  | 'stage'
  /** Operator expedite toggle (`orders.is_urgent`). */
  | 'urgent'
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
 * Canonical in-warehouse To-ship column model, in strict scan order:
 *   select · order · late · product · stage · tester · testedAt · packer · packedAt ·
 *   station · urgent · cond · qty · tracking · _fill
 *
 * One model for the whole desk — stage is a row fact, not a tab that swaps
 * columns. Empty tester/packer/location cells are the truth until those events
 * land. Status + Platform columns stay retired; listing open stays on the
 * product-cell hover link.
 *
 * **Order** (`order`) is the lead identity track: frozen beside select, no
 * `hideKey`. **Late** (`age`) sits immediately after Order. Product-only resize
 * with trailing `_fill` as the sole `1fr` track.
 */
export const ORDERS_QUEUE_COLUMNS: readonly OrdersQueueColumn[] = [
  { key: 'select', width: 'minmax(2rem, 2rem)', frozen: true, resizable: false },
  {
    key: 'order',
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
    key: 'stage',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Stage',
    type: 'tag',
    align: 'start',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'tester',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Tester',
    type: 'text',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'testedAt',
    width: 'minmax(7rem, 7rem)',
    label: 'Tested',
    type: 'date',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'packer',
    width: 'minmax(5.5rem, 5.5rem)',
    label: 'Packer',
    type: 'text',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'packedAt',
    width: 'minmax(7rem, 7rem)',
    label: 'Packed',
    type: 'date',
    resizable: false,
    labelFitRem: 4.5,
  },
  {
    key: 'packStation',
    width: 'minmax(6rem, 6rem)',
    label: 'Station',
    type: 'location',
    align: 'start',
    resizable: false,
    labelFitRem: 5,
  },
  {
    key: 'urgent',
    width: 'minmax(4rem, 4rem)',
    label: 'Urgent',
    type: 'tag',
    align: 'start',
    resizable: false,
    labelFitRem: 4,
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

/**
 * @deprecated Prefer {@link ORDERS_QUEUE_COLUMNS} — the desk is one in-warehouse
 * model. Kept as an alias so older `fulfillment.tested` bindings keep compiling
 * until callers finish migrating.
 */
export const ORDERS_QUEUE_TESTED_COLUMNS: readonly OrdersQueueColumn[] = ORDERS_QUEUE_COLUMNS;

/** Mode ids for the orders-queue column model. Both modes share one SoT. */
export type OrdersQueueColumnMode = 'fulfillment.default' | 'fulfillment.tested';

/** Column model per mode — both resolve to the in-warehouse SoT. */
export function ordersQueueColumnsFor(
  _mode: OrdersQueueColumnMode,
): readonly OrdersQueueColumn[] {
  return ORDERS_QUEUE_COLUMNS;
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

/**
 * COMPOUND (two-row) Orders / To-Ship columns.
 *
 * A **sibling array, never a filter of {@link ORDERS_QUEUE_COLUMNS}**. The two
 * models answer different questions: the flat one is a spreadsheet (one fact
 * per sortable track), this one is a scan list (four compound cells pairing an
 * identifier with its qualifier).
 *
 * **The geometry is not declared here.** It comes from `COMPOUND_TRACKS`
 * (`components/tables/compound/compound-columns.ts`) — the same objects
 * Receiving, Incoming and Tasks mount. This used to be a hand-copied array kept
 * equal to Receiving's by a unit test; deriving both from one declaration makes
 * "the two tables read as one product" a property of construction rather than
 * a promise someone has to keep.
 *
 * The engine is unchanged: `LedgerGridSurface` still owns width, freeze,
 * resize, per-staff visibility and virtualization.
 */
export const ORDERS_COMPOUND_COLUMNS: readonly OrdersQueueColumn[] =
  compoundColumnsFor<OrdersQueueColumn>();

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
