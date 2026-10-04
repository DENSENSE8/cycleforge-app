/** Ledger grid CELL CHROME — inset, hairline rules, frozen sticky class, and the columnar row shell. */

import { densityScaledRem } from './grid-column-geometry';

/** Horizontal (+ optional vertical) cell inset for LedgerGrid tracks. */
export const LEDGER_GRID_CELL_INSET = 'px-1.5';
/** Grid-skin cell pad — horizontal + vertical so the row shell can be `p-0`. */
const LEDGER_GRID_GRID_CELL_INSET = 'px-1.5 py-1';

/** Chrome that pins a frozen cell during horizontal scroll — sticky position, a z above the scrolling cells, and the row's own background… */
export const LEDGER_GRID_FROZEN_CELL = 'sticky z-raised bg-inherit';

export type LedgerGridCellInset = 'cell' | 'grid' | 'none';

/** Per-column cell chrome shared by the sticky header, every row, and group summaries — the helper that makes a queue read as a continuous… */
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

/** Desktop columnar shell (every LedgerGrid family). */
export const LEDGER_GRID_ROW_WIDTH_CLASS = 'cf-grid-row-w';

export function ledgerGridRowShellClass(
  isMobile: boolean,
  opts?: { scrollMinContent?: boolean },
): string {
  return isMobile
    ? 'flex flex-col gap-1.5'
    : [
        'grid items-stretch',
        LEDGER_GRID_ROW_CONTAIN,
        opts?.scrollMinContent ? LEDGER_GRID_ROW_WIDTH_CLASS : 'w-full min-w-0',
      ].join(' ');
}

/** Layout/style containment on every desktop row shell. */
export const LEDGER_GRID_ROW_CONTAIN = '[contain:layout_style]';

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
