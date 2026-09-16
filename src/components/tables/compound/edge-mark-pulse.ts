/**
 * One clock for every slot-table edge-mark traveler.
 *
 * Per-instance `animate` starts on mount, so virtualized rows drift. All
 * rails read `performance.now()` (or the rAF timestamp) so they share phase
 * and the same y at any frame.
 */

export function edgeMarkEaseInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Position in the shared ping-pong cycle: 0 at the cycle edges, 1 at the
 * middle. Both faces on the rail read it from the same `nowMs`, which is what
 * keeps a bob and a flash from drifting apart row by row.
 */
function edgeMarkTriangle(nowMs: number, durationSec: number): number {
  const cycle = durationSec * 1000;
  const u = (((nowMs % cycle) + cycle) % cycle) / cycle;
  return u < 0.5 ? u * 2 : 2 - u * 2;
}

/** Ping-pong 0 → travel → 0 over `durationSec`, eased in and out. */
export function edgeMarkTravelY(
  nowMs: number,
  travel: number,
  durationSec: number,
): number {
  return edgeMarkEaseInOut(edgeMarkTriangle(nowMs, durationSec)) * travel;
}

/**
 * Floor for a SINGLE resting mark: it breathes, it never leaves. A glyph that
 * reaches 0 reads as "gone", and the fact has not gone anywhere.
 */
export const EDGE_MARK_FLASH_FLOOR = 0.35;

/**
 * Shared-clock FLASH opacity for a resting gutter mark
 * (`CompoundSelectStatusFace`), and the ROTATION when a row carries more than
 * one.
 *
 * Same clock, same triangle, same easing as {@link edgeMarkTravelY} — so a
 * glyph and the rail beside it stay in phase on every row, including after a
 * virtualizer remount. Callers pass HALF the rail period so a mark reads as a
 * flash rather than a slow breath while staying phase-locked to it.
 *
 * ## One mark: breathe
 *
 * `1 → floor → 1` over `durationSec`. One soft cycle, so it stays well under
 * WCAG 2.3.1's three-flashes threshold at every duration this is called with.
 *
 * ## Two or more: alternate (operator 2026-09-15)
 *
 * "If it is out of stock and urgent, it should flash between out of stock Alert
 * icon and the is-urgent lightning bolt." The cycle grows to
 * `durationSec × count` and each mark owns one slot, fading `0 → 1 → 0` inside
 * it — so the next mark rises exactly where this one has vanished and the 16px
 * box never paints two glyphs at once. Full fade is correct HERE and wrong for
 * a lone mark: with a partner the box is never empty, it is the other fact's
 * turn.
 *
 * `index` is the mark's position in the row's heat-ordered marks; every row on
 * screen with the same marks therefore shows the same one at the same instant.
 */
export function edgeMarkFlashOpacity(
  nowMs: number,
  durationSec: number,
  index = 0,
  count = 1,
): number {
  if (count <= 1) {
    return (
      EDGE_MARK_FLASH_FLOOR +
      (1 - EDGE_MARK_FLASH_FLOOR) * (1 - edgeMarkEaseInOut(edgeMarkTriangle(nowMs, durationSec)))
    );
  }
  const cycle = durationSec * 1000;
  const total = cycle * count;
  const now = ((nowMs % total) + total) % total;
  if (Math.floor(now / cycle) !== index) return 0;
  return edgeMarkEaseInOut(edgeMarkTriangle(now, durationSec));
}
