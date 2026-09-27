/** Unbox right-edge secondary surfaces — one at a time. */

import { dispatchStationDisplaysClose } from '@/utils/events';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';

/**
 * Legacy / stale URL params that once owned the Displays column.
 * Kept only so mount + desk-occupant claim can strip them silently.
 */
export const UNBOX_RIGHT_EDGE_PARAMS = {
  display: [
    'display',
    'claimMode',
    'photoAction',
    'linkageAction',
    'inventoryAction',
    'ticketAction',
    'unitsAction',
    // Compat leftovers — strip whenever cleaning the URL bar.
    'ticketView',
    'claimView',
  ],
} as const;

type UnboxRightEdgeSurface = keyof typeof UNBOX_RIGHT_EDGE_PARAMS;

/**
 * Drop every right-edge param except the surface being opened, **in the
 * caller's own `URLSearchParams`**.
 */
export function clearPeerRightEdgeParams(
  params: URLSearchParams,
  keep: UnboxRightEdgeSurface,
): void {
  for (const [surface, names] of Object.entries(UNBOX_RIGHT_EDGE_PARAMS)) {
    if (surface === keep) continue;
    for (const name of names) params.delete(name);
  }
}

/** Drop every Unbox right-edge URL param (stale-strip / desk claim). */
export function clearAllUnboxRightEdgeParams(params: URLSearchParams): void {
  for (const names of Object.values(UNBOX_RIGHT_EDGE_PARAMS)) {
    for (const name of names) params.delete(name);
  }
}

/**
 * Silent strip of stale Displays URL keys — no App Router soft-replace.
 * Used on Displays hook mount and when a desk occupant claims the edge.
 */
export function stripStaleUnboxRightEdgeParamsFromUrl(): void {
  if (typeof window === 'undefined') return;
  const next = readLiveSearchParams(window.location.search.replace(/^\?/, ''));
  const before = next.toString();
  clearAllUnboxRightEdgeParams(next);
  const after = next.toString();
  if (after === before) return;
  const path = window.location.pathname;
  window.history.replaceState(window.history.state, '', after ? `${path}?${after}` : path);
}

/** Claim the right edge for a DESK occupant of `RightRailHost` mounted on a station page — Check receipts and any future Band-1 tool. */
export function yieldStationRightEdgeForDeskOccupant(replaceUrl?: (qs: string) => void): void {
  if (typeof window === 'undefined') return;
  const next = readLiveSearchParams(window.location.search.replace(/^\?/, ''));
  const before = next.toString();
  clearAllUnboxRightEdgeParams(next);
  const after = next.toString();
  if (after !== before) {
    if (replaceUrl) {
      replaceUrl(after);
    } else {
      const path = window.location.pathname;
      window.history.replaceState(window.history.state, '', after ? `${path}?${after}` : path);
    }
  }
  dispatchStationDisplaysClose();
}
