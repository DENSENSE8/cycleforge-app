/**
 * Stable per-carton rail key — a dependency-free, server-safe home for
 * `receivingRailCartonKey`. It used to live in `receiving-queries.ts` (a
 * `'use client'` module); it moved here so the RSC first-paint rail seed can
 * produce byte-identical `client_event_id`s WITHOUT pulling that client module
 * into the server graph (where its exports would resolve to uncallable
 * client-reference proxies). `receiving-queries.ts` re-exports it for its
 * existing client importers.
 */

/** Stable React list key for one carton across stub → server reconcile. */
export function receivingRailCartonKey(receivingId: number): string {
  return `carton:${receivingId}`;
}
