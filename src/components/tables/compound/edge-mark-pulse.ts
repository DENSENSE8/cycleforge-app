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

/** Ping-pong 0 → travel → 0 over `durationSec`, eased in and out. */
export function edgeMarkTravelY(
  nowMs: number,
  travel: number,
  durationSec: number,
): number {
  const cycle = durationSec * 1000;
  const u = (((nowMs % cycle) + cycle) % cycle) / cycle;
  const triangle = u < 0.5 ? u * 2 : 2 - u * 2;
  return edgeMarkEaseInOut(triangle) * travel;
}
