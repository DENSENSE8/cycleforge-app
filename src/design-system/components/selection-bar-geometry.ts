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
 * Bottom padding a **bounded** scroll host reserves so its last row clears the
 * pinned capsule.
 *
 * Sized from what the host actually needs, not from the capsule's full height.
 * `WORKBENCH_TABLE_VIEWPORT` already stops ~45px short of the viewport bottom,
 * so at the default `pb-3` the last row clears the capsule by **2px** (measured
 * on Pending and Packed at viewport heights 560 / 720 / 900). The capsule is
 * not hiding rows today; what is missing is any RULE keeping it from doing so —
 * that 2px is a coincidence of the surrounding chrome, and a change to the
 * header, the KPI strip, or `WORKBENCH_BODY_COLUMN`'s padding flips it negative.
 *
 * `pb-8` (2rem) turns the coincidence into ~22px of deliberate clearance for
 * 20px of extra inset. A full-capsule reserve (`pb-20`, 5rem) was measured too:
 * it buys 70px of clearance and costs ~1.5 rows of a warehouse monitor every
 * time a selection is live — the wrong trade for a gap that is already positive.
 *
 * It rides the density-aware spacing scale, so the reserve tracks the capsule
 * when `--cf-density` changes; a hand-picked `pb-[32px]` would not.
 *
 * Only hosts a capsule can actually float over take this. A grid with no
 * selection gutter keeps its normal inset.
 */
export const SELECTION_BAR_SCROLL_INSET = 'pb-8';
