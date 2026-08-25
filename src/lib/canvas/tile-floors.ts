/**
 * Canvas tile floors — the geometry budget, and the one decision on this
 * refactor that arithmetic cannot settle.
 *
 * ## ⚠️ THIS IS A RECOMMENDATION AWAITING OPERATOR CONFIRMATION
 *
 * `docs/warehouse-os/03-decisions.md` D4 is **not ruled**. The numbers below are
 * the recommendation on file, implemented so the canvas can ship and be looked
 * at; they are not law, and the docblock says so on purpose so nobody two months
 * from now reads a shipped constant as a settled one.
 *
 * ### The measurement that forced the question
 *
 * The floors already in the tree do not fit the machines this app runs on:
 *
 * ```
 *   MIN_WORK_SURFACE_PX  784   (desk work-surface floor, right-rail frame)
 *   spine                240
 *   right rail           420
 *
 *   two session tiles at 784      = 1,568px  before any rail
 *   … with the spine              = 1,808px
 *   … with the spine + right rail = 2,228px
 *
 *   Playwright viewport            1440 × 900
 *   Electron window (opens at)     1600 × 1000
 * ```
 *
 * On both the tested and the shipped desktop viewport, **two session tiles
 * cannot render at their declared minimum.** Every downstream geometry decision
 * depends on which way that is resolved, so it cannot be quietly deferred.
 *
 * ### What is implemented here (D4's recommendation: (b) + (a) together)
 *
 * - **{@link CANVAS_TILE_FLOORS}.sessionMinWidthPx keeps the 784 floor.** It is
 *   not a copy of the number — it IS `MIN_WORK_SURFACE_PX`, imported, so the two
 *   can never drift. A scan bench does not degrade gracefully: the carton
 *   identity row, the PO-line grid and the scan dock each have a width below
 *   which they stop being usable rather than merely tight.
 * - **A smaller table floor (520).** A table DOES degrade gracefully — columns
 *   hide, the grid scrolls, and the operator still reads rows. 520 seats roughly
 *   four ops columns plus the row chrome, which is the point below which a grid
 *   stops being a grid.
 * - **A tool floor (360)** — `DETAIL_STACK_RESIZE.minWidthPx`, the width the
 *   desk inspector already proved is the floor for a single-column tool.
 * - **Session-beside-session is gated to ≥ 1920** ({@link
 *   CANVAS_TILE_FLOORS}.sessionSplitMinFramePx). Below it the canvas ships a
 *   single tile and the second session stays one keystroke away in the strip —
 *   D4 option (b), "gate split-screen and ship single-tile below it".
 *
 * ### If the operator rules differently, this is what changes
 *
 * - **Rules (a) alone — "drop the 784 floor":** delete
 *   `sessionSplitMinFramePx` and lower `sessionMinWidthPx`. Nothing else moves;
 *   `resolveCanvasLayout` already degrades purely on whether the floors fit, so
 *   a smaller floor simply makes more layouts fit. Note that lowering it here
 *   does NOT lower `MIN_WORK_SURFACE_PX` — the right-rail push budget is a
 *   different question with its own 22 tests.
 * - **Rules (c) — "tiles overlap below a threshold":** `resolveCanvasLayout`'s
 *   `degraded: 'single'` branch becomes `degraded: 'overlay'` and the host
 *   stacks tiles with a z-order instead of dropping to one. The solver already
 *   reports `fits: false` + `shortfallPx`, which is the input that branch needs;
 *   no geometry has to be re-derived.
 * - **Rules "1920 is the wrong gate":** it is one number in one place, and it is
 *   evaluated against the CANVAS FRAME width (not the split's own available
 *   width) because 1920 came from a whole-viewport measurement. Changing the
 *   number is a one-line edit; changing what it is measured against is a
 *   two-line edit in {@link canvasSessionSplitAllowed}.
 *
 * Recorded in the component report's `risks` as well, so it reaches the operator
 * through the run summary and not only through a file nobody opened.
 */

import { MIN_WORK_SURFACE_PX } from '@/lib/right-rail/frame';
import { DETAIL_STACK_RESIZE } from '@/lib/design/detail-stack-resize';
import type { TabKind } from '@/lib/workspace/types';

/**
 * The whole canvas geometry budget, in one block. Every floor the tiling solver
 * consults comes from here — there is no second place to look, and no per-tile
 * override, because a per-tile floor is how the station frame ended up with
 * three hand-rolled cap functions that had to be kept in agreement by hand.
 *
 * See the file docblock: **pending operator confirmation of D4.**
 */
export const CANVAS_TILE_FLOORS = {
  /**
   * A session tile's floor — the desk work-surface floor, imported rather than
   * copied. A scan bench crushed below this stops working; it does not merely
   * look tight.
   */
  sessionMinWidthPx: MIN_WORK_SURFACE_PX,

  /**
   * A table tile's floor. Lower than a session's on purpose: a grid degrades
   * (columns hide, the body scrolls) where a bench does not. ~4 ops columns plus
   * row chrome.
   */
  tableMinWidthPx: 520,

  /**
   * A tool tile's floor — the width the desk inspector already established for a
   * single-column utility (`DETAIL_STACK_RESIZE.minWidthPx`).
   */
  toolMinWidthPx: DETAIL_STACK_RESIZE.minWidthPx,

  /**
   * Every tile's floor on the vertical axis. One number for all kinds, because
   * nothing in the tree has ever published a per-surface height floor and
   * inventing three would be three guesses instead of one. 320 seats a tile's
   * 28px chrome row plus enough body for a scan dock or ~6 grid rows; two
   * stacked tiles therefore need 640, which fits Playwright's 900 and Electron's
   * 1000 with the 40px header and the station chrome above them.
   */
  tileMinHeightPx: 320,

  /**
   * Frame width below which two SESSION tiles may not sit side by side.
   *
   * Measured against the canvas frame, not the split's own available width,
   * because 1920 came from a whole-viewport measurement (D4). A canvas narrower
   * than this ships the focused session alone; the other stays open in the strip
   * and is one keystroke away.
   */
  sessionSplitMinFramePx: 1920,
} as const satisfies Record<string, number>;

/**
 * The floor for a tile showing a tab of this kind. A tile with no tab (an empty
 * pane offering the launcher) takes the tool floor — it is a chooser, and a
 * chooser is a single-column utility.
 */
export function tileMinWidthPx(kind: TabKind | null): number {
  switch (kind) {
    case 'session':
      return CANVAS_TILE_FLOORS.sessionMinWidthPx;
    case 'table':
      return CANVAS_TILE_FLOORS.tableMinWidthPx;
    case 'tool':
    case null:
    default:
      return CANVAS_TILE_FLOORS.toolMinWidthPx;
  }
}

/**
 * May two session tiles be tiled side by side at this frame width?
 *
 * The one place the ≥1920 gate is evaluated. A ruling that moves the gate to a
 * per-split measurement changes this function and nothing else.
 */
export function canvasSessionSplitAllowed(frameWidthPx: number): boolean {
  if (!Number.isFinite(frameWidthPx)) return false;
  return frameWidthPx >= CANVAS_TILE_FLOORS.sessionSplitMinFramePx;
}
