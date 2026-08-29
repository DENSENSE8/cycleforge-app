/**
 * Unbox right-edge secondary surfaces — one at a time.
 *
 * After Displays unify: **Displays** (local React state via
 * `useUnboxDisplayView`) ∪ `detail:receiving` ∪ AI ∪ desk Add inbound
 * (`detail:incoming-desk-tools`). Root Index → leaf drill-down; Ticket nests
 * Chat · Claim; photo tools nest under Photos — not peer push columns.
 *
 * Stale URL keys (`display`, nest actions, legacy `ticketView` / `claimView`)
 * are stripped on mount / desk-occupant claim via silent `history.replaceState`
 * so old bookmarks cannot reopen the column or leave peer params behind.
 *
 * **AI (header Sparkles) shares the product “one right details column” law**
 * (source-of-truth → Right-rail modality · Frame column budget): opening the
 * assistant yields Displays; opening Displays closes the assistant via
 * {@link dispatchAssistantDockClose}. Opening Displays also
 * {@link dispatchStationDeskOccupantClose}; opening Add clears Displays via
 * {@link dispatchStationDisplaysClose}.
 */

import {
  dispatchAssistantDockClose,
  dispatchStationDeskOccupantClose,
  dispatchReceivingDetailsOverlayClose,
  dispatchStationDisplaysClose,
} from '@/utils/events';
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

/**
 * Suspend receiving More details (legacy helper name kept for call sites that
 * previously also cleared Claim/Ticket peer flags — those are now Displays).
 */
export function clearUnboxPeerRightEdgeSurfaces(): void {
  dispatchReceivingDetailsOverlayClose();
}

/**
 * AI dock just opened (false→true) — yield every Unbox station right-edge surface.
 *
 * Unbox twin of {@link useYieldStationDisplaysOnAssistantOpen}: closes Displays
 * via React state only (Arrival / Testing parity). Mechanisms stay forked (C2).
 */
export function yieldUnboxStationPushesOnAssistantOpen(opts: {
  closeDisplays?: () => void;
  /** @deprecated Prefer `closeDisplays` — aliased when present. */
  clearDisplay?: () => void;
  /** @deprecated URL peer clear retired — Displays are local state. */
  clearAllUrl?: () => void;
  /** @deprecated Tool push retired — kept optional for one release of call sites. */
  closeToolPush?: () => void;
}): void {
  (opts.closeDisplays ?? opts.clearDisplay)?.();
  opts.closeToolPush?.();
  dispatchStationDeskOccupantClose();
}

/**
 * Claim the right edge for a DESK occupant of `RightRailHost` mounted on a
 * station page — Add inbound, Check receipts, and any future Band-1 tool. One
 * wrapper with Displays / details / AI: strips stale Unbox Displays URL keys,
 * closes Arrival's React-state Displays, receiving details, and the assistant.
 *
 * Every occupant MUST call this as it opens, and MUST close itself on
 * {@link STATION_DESK_OCCUPANT_CLOSE_EVENT} — the two halves of the exclusion.
 * Check shipped with neither and painted a second full right column beside
 * Displays (fixed 2026-08-10; pinned by `station-right-edge-one-wrapper.spec.ts`).
 */
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
  dispatchReceivingDetailsOverlayClose();
  dispatchAssistantDockClose();
  dispatchStationDisplaysClose();
}
