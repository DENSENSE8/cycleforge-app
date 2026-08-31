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
export const LEDGER_GRID_CELL_INSET = 'px-1.5';
/**
 * Grid-skin cell pad — horizontal + vertical so the row shell can be `p-0`.
 *
 * `px-1.5` since 2026-08-31 (operator ruling), down from `px-2`. Every track
 * paid 16px of inset, so between two adjacent columns the operator read 32px of
 * empty before the hairline — wide enough that the status columns looked
 * gutter-separated rather than adjacent. 12px per pair still keeps a value off
 * its rule at every density.
 */
const LEDGER_GRID_GRID_CELL_INSET = 'px-1.5 py-1.5';

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
 *
 * ## Why this is a hand-written class and not a Tailwind arbitrary value
 *
 * It used to be `` `w-[var(${LEDGER_GRID_WIDTH_VAR})] …` `` — a template
 * literal. Tailwind extracts utilities by scanning source TEXT, so what its
 * scanner saw was `w-[var(${LEDGER_GRID_WIDTH_VAR})]`, which is not a utility.
 * It generated nothing. Every row shipped with the class NAME in its attribute
 * and no rule behind it, so `width` fell back to `auto` and each row sized to
 * its scrollport instead of to the shared track width.
 *
 * The consequence was the whole horizontal axis: tracks summing to 1280px were
 * laid out in a 1150px row, so they overflowed a row whose own `overflow` is
 * visible, the scrollport's `scrollWidth` never grew past its `clientWidth`,
 * and the grid could not scroll sideways at all — the right-hand columns were
 * simply unreachable outside fullscreen. Measured on `/shipping/orders` before
 * the fix: port `scrollWidth 1150 === clientWidth 1150`, row tracks `1280`.
 *
 * `cf-grid-row-w` is a real rule in `globals.css`, so it cannot be optimized
 * away by a scanner that never sees it. Never rebuild this as an interpolated
 * arbitrary value.
 */
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

/**
 * Layout/style containment on every desktop row shell. Isolates a cell
 * mutation so it cannot reflow sibling rows (INP / layout-thrash). Do NOT
 * add `contain: paint` — frozen sticky identity cells must paint across
 * the scrolling pane.
 */
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
