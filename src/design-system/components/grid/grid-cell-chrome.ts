/**
 * Ledger grid CELL CHROME — inset, hairline rules, frozen sticky class, and the
 * columnar row shell. One implementation, read by every Workbench spreadsheet.
 *
 * These lived under `dashboard-order-row-layout.ts` as `ordersQueueGridCell` /
 * `ORDERS_QUEUE_FROZEN_CELL` / `ordersQueueRowShellClass` and were re-exported
 * under ~13 surface aliases. Geometry already moved into
 * {@link ./grid-column-geometry}; this module finishes the chrome half so the
 * engine owns spreadsheet cell paint, not an Orders-named layout file.
 *
 * Surface layouts keep thin named aliases (`incomingGridCell`, …) so call sites
 * stay stable; new code should import from `@/design-system/components/grid`.
 */

import { densityScaledRem } from './grid-column-geometry';

/** Horizontal (+ optional vertical) cell inset for LedgerGrid tracks. */
export const LEDGER_GRID_CELL_INSET = 'px-2';
/** Grid-skin cell pad — horizontal + vertical so the row shell can be `p-0`. */
const LEDGER_GRID_GRID_CELL_INSET = 'px-2 py-1.5';

/**
 * Chrome that pins a frozen cell during horizontal scroll — sticky position, a z
 * above the scrolling cells, and the row's own background (via `inherit`) so
 * selection / zebra paint through the pinned pane. Compose with
 * {@link ledgerGridCell}; set the `left` offset from {@link gridFrozenLeft} in
 * `style`. The last frozen edge also carries `data-frozen-edge` so a scroll
 * shadow can hang off it (see `.cf-grid-scrolled`).
 */
export const LEDGER_GRID_FROZEN_CELL = 'sticky z-raised bg-inherit';

export type LedgerGridCellInset = 'cell' | 'grid' | 'none';

/**
 * Per-column cell chrome shared by the sticky header, every row, and group
 * summaries — the helper that makes a queue read as a continuous spreadsheet
 * (Sheets), not a hairline list.
 *
 * **1B (2026-08-04):** BOTTOM row rules live on the airtable CSS skin / row
 * shell — this helper no longer paints `border-r`. The `rule` arg stays for
 * call-site compatibility but is a no-op for vertical paint.
 *
 * @param rule  retained for API compatibility; does not paint a vertical rule.
 * @param inset `'cell'` board default · `'grid'` skin (px+py) · `'none'` gutters.
 */
export function ledgerGridCell(
  { rule: _rule = true, inset = 'cell' }: { rule?: boolean; inset?: LedgerGridCellInset } = {},
): string {
  return [
    'flex min-w-0 items-center self-stretch',
    inset === 'cell' ? LEDGER_GRID_CELL_INSET : inset === 'grid' ? LEDGER_GRID_GRID_CELL_INSET : '',
    inset === 'grid' ? 'overflow-hidden' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Desktop columnar shell (every LedgerGrid family).
 *
 * `items-stretch` so every cell fills the row height and its
 * {@link ledgerGridCell} right hairline runs full height. No `gap-x` — cells
 * butt together; inset + rule own inter-column spacing.
 *
 * `scrollMinContent`: every virtualized row shares ONE width via
 * {@link LEDGER_GRID_WIDTH_VAR} (published on the scrollport as
 * `max(100%, <content-min>rem[, <live-px>px])`). Never `w-max` per row.
 */
export function ledgerGridRowShellClass(
  isMobile: boolean,
  opts?: { scrollMinContent?: boolean },
): string {
  return isMobile
    ? 'flex flex-col gap-1.5'
    : [
        'grid items-stretch',
        opts?.scrollMinContent
          ? `w-[var(${LEDGER_GRID_WIDTH_VAR})] min-w-[var(${LEDGER_GRID_WIDTH_VAR})]`
          : 'w-full min-w-0',
      ].join(' ');
}

/** CSS custom property: shared row/header width under LedgerGrid `scrollX`. */
export const LEDGER_GRID_WIDTH_VAR = '--cf-orders-grid-w';

/**
 * Value for {@link LEDGER_GRID_WIDTH_VAR}: fill the scrollport, or content-min
 * if wider. When `contentMinWidthPx` is set (live resized tracks), it lifts the
 * floor alongside the SoT rem sum so row `min-width` grows after drag-resize.
 */
export function ledgerGridWidthVarValue(
  contentMinWidthRem: number,
  contentMinWidthPx?: number,
): string {
  // Rem floor follows spreadsheet zoom / compact density (`--cf-density`).
  // Absolute px (live drag-resize) does not — it is already measured.
  const remFloor = densityScaledRem(contentMinWidthRem);
  if (
    contentMinWidthPx != null &&
    Number.isFinite(contentMinWidthPx) &&
    contentMinWidthPx > 0
  ) {
    return `max(100%, ${remFloor}, ${Math.ceil(contentMinWidthPx)}px)`;
  }
  return `max(100%, ${remFloor})`;
}
