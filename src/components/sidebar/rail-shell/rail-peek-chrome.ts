/** Rail hover-peek chrome — one pad / seam / chip-stack rhythm for {@link RailPeekCard} and Receiving's richer popover. */

/** Outer card inset — 12px on every edge. */
export const RAIL_PEEK_PAD_CLASS = 'p-3';

/**
 * Ruled section seam under the title block (identity chips · meta · footer).
 * `mt-2.5` clears the prior block; `pt-2.5` pads inside the rule — one step.
 */
export const RAIL_PEEK_SECTION_CLASS =
  'mt-2.5 border-t border-border-hairline pt-2.5';

/**
 * Vertical step between paired identity rows
 * (order·trk → sku·sn → ticket → bin).
 */
export const RAIL_PEEK_CHIP_STACK_CLASS =
  'flex flex-col items-start gap-y-1 [&>*]:shrink-0';

/**
 * One identity row — leading chip start, trailing chip end (`justify-between`)
 * so order·trk / sku·sn read as two columns with air in the middle.
 * Solo rows (ticket · bin · missing partner) stay start-aligned via a single child.
 */
export const RAIL_PEEK_CHIP_PAIR_CLASS =
  'flex w-full items-center justify-between gap-x-1 [&>*]:shrink-0';

/**
 * Zero each CopyChip face's default `px-1.5` so icons share one x-rail inside
 * the peek, and bump icon→label to `gap-1` so it matches the chip-row step.
 * The peek host owns horizontal breathing via {@link RAIL_PEEK_PAD_CLASS}.
 */
export const RAIL_PEEK_CHIP_FACE_FLUSH_CLASS =
  '[&_[data-chip-face]]:px-0 [&_[data-chip-face]_button]:gap-1';
