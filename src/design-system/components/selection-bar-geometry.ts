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
 * Bottom padding a **bounded** scroll host reserves so its content clears the
 * pinned capsule.
 *
 * Sized to the capsule's own footprint, deliberately: `h-10` control +
 * `p-1.5` shell (50px measured) + the `pb-4` viewport gap = **68px** of the
 * viewport bottom that the capsule owns. `pb-20` (5rem / 80px) covers it with
 * room to spare, so the guarantee holds on the reserve alone.
 *
 * It does NOT lean on the surrounding layout. Measured at 1440x900 with the
 * page scrolled to the end, the bounded host's own bottom edge lands ~33px
 * above the viewport bottom, so a reserve of ~35px would technically clear the
 * capsule today — but only because the chrome above happens to push the host
 * that far up. Sizing to the capsule instead keeps this correct when the
 * header, the KPI strip, or `WORKBENCH_BODY_COLUMN`'s padding changes.
 *
 * Measured clearance between the grid's scrollport edge and the capsule top
 * (Playwright, desktop 1440x900, grid scrolled to its end):
 *   `pb-3`  (12px, the default) → **-23px**, the capsule covers ~half a row
 *   `pb-8`  (32px)              → **-3px**, still overlapping
 *   `pb-20` (80px)              → **+45px**
 *
 * It rides the density-aware spacing scale, so the reserve tracks the capsule
 * when `--cf-density` changes; a hand-picked `pb-[80px]` would not.
 *
 * Only hosts a capsule can actually float over take this. A grid with no
 * selection gutter keeps its normal inset.
 *
 * Guarded by `tests/e2e/dashboard-bulk-bar-inset.spec.ts` — it asserts the
 * scrollport edge clears the capsule, so shrinking this fails CI rather than
 * silently putting rows back under the bar.
 */
export const SELECTION_BAR_SCROLL_INSET = 'pb-20';
