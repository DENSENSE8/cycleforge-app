/** The compound row's fixed geometry — ONE display method, no operator setting. */

/** Row box in px — the compound cell's height and the virtualizer estimate. */
export const COMPOUND_ROW_PX = 48;

/**
 * Expanded leaf = product row + detail band (two {@link COMPOUND_ROW_PX} boxes).
 * Idle compound face stays 48; only the inserted detail leaf adds the second 48.
 * Callers: CompoundRowDetailBand / VirtualGroupedSections estimate when open.
 */
export const COMPOUND_ROW_DETAIL_EXPANDED_PX = COMPOUND_ROW_PX * 2;

/** The GUTTER track — `select` and `thumb` — in rem. */
export const COMPOUND_GUTTER_TRACK_REM = COMPOUND_ROW_PX / 16;

/**
 * The SELECT gutter — narrower than the photo gutter, and deliberately not a square.
 * column an operator's eye passes first. Operator 2026-09-04: smaller in width,
 */
export const COMPOUND_SELECT_TRACK_REM = 1.5;

/** The leading edge RAIL — width, and the matching inset for everything that centres beside it. */
export const COMPOUND_EDGE_RAIL_CLASS = 'w-[3px]';
export const COMPOUND_GUTTER_RAIL_INSET_CLASS = 'pl-[3px]';

/** The MARK's vertical pin: */
export const COMPOUND_GUTTER_MARK_TOP_PIN_CLASS = 'items-start pt-1';

/** The CHEVRON BAND — the detail / fold affordance's own track, the bottom HALF of the select gutter, under the top-pinned mark. */
export const COMPOUND_GUTTER_CHEVRON_BAND_CLASS = 'absolute inset-x-0 bottom-0 h-6';

/** The chevron's reveal box — the same 16px box the mark above it wears. */
export const COMPOUND_GUTTER_CHEVRON_GLYPH_CLASS = 'flex h-4 w-4 items-center justify-center';

/** The same gutter track in px, at a 16px root. */
export const COMPOUND_GUTTER_PX = COMPOUND_ROW_PX;

/**
 * The TWO marks on a multi-line fold — one for MEMBERSHIP, one for the CLOSE.
 * block (operator 2026-09-14: "it must display when it's opened or closed, to
 * more visible than the other bottom hairlines"* (operator 2026-09-14) —
 * existed. **That ruling is superseded (operator 2026-09-15: a softer mark,
 */
export const COMPOUND_GROUP_FOLD_INNER_CLASS =
  'pointer-events-none absolute inset-x-0 bottom-0 z-sticky h-px bg-border-default';

/**
 * The CHILD RAIL — a 2px vertical hairline down a group child, on the IDENTITY
 * track's leading edge. This is how membership is spoken (operator 2026-09-15).
 */
export const COMPOUND_GROUP_CHILD_RAIL_CLASS =
  'pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-border-default';
