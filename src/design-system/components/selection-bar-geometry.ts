/**
 * Geometry of the pinned bulk-selection capsule ({@link MobileSelectionBar}).
 *
 * Split out of the component for **bundle altitude**: a bounded scroll host has
 * to reserve room for the capsule, and importing that number from the component
 * would drag framer-motion, the icon set, and `HoverTooltip` into every
 * workbench layout module that only wanted a padding class. This file imports
 * nothing.
 *
 * It is also the reason the reserve cannot drift: the capsule's own control box
 * and viewport gap live here too, so a change to the capsule's height and the
 * space a grid leaves for it are the same edit.
 */

/**
 * Square hit-box for every capsule control. 40px: these are icon-only targets
 * floating at the bottom edge of a grid, where a clipped or near-miss click
 * reads to the operator as "the button did nothing".
 */
export const SELECTION_BAR_CONTROL_BOX =
  'flex h-10 w-10 items-center justify-center rounded-full';

/** Gap between the capsule and the viewport bottom edge. */
export const SELECTION_BAR_VIEWPORT_GAP = 'pb-4';

/**
 * Bottom padding a **bounded** scroll host must reserve so its last row clears
 * the pinned capsule.
 *
 * `h-10` control + `p-1.5` capsule shell + `pb-4` viewport gap ≈ 4.25rem;
 * `pb-20` (5rem) is the next scale step up and leaves a row of breathing room.
 * Every value here rides the density-aware spacing scale, so the reserve tracks
 * the capsule itself when `--cf-density` changes — a hand-picked `pb-[68px]`
 * would not.
 *
 * Only hosts that a capsule can actually float over take this. A grid with no
 * selection gutter keeps its normal inset.
 */
export const SELECTION_BAR_SCROLL_INSET = 'pb-20';
