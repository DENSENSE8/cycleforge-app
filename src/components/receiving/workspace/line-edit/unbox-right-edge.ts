/**
 * Unbox right-edge secondary surfaces — one at a time.
 *
 * After Displays unify: **Displays** (`?display=index|<leaf>` + nested action
 * params) ∪ `detail:receiving` ∪ AI ∪ desk Add inbound (`detail:incoming-import-*`).
 * Root Index → leaf drill-down; Ticket nests Chat · Claim; photo tools nest under
 * Photos — not peer push columns.
 *
 * Legacy `ticketView` / `claimView` are still cleared on open so old deep links
 * cannot leave a second surface param behind during the compat window.
 *
 * **AI (header Sparkles) shares the product “one right details column” law**
 * (source-of-truth → Right-rail modality · Frame column budget): opening the
 * assistant yields Displays; opening Displays closes the assistant via
 * {@link dispatchAssistantDockClose}. Opening Displays also
 * {@link dispatchIncomingAddInboundClose}; opening Add clears Displays URL +
 * {@link dispatchStationDisplaysClose}.
 */

import {
  dispatchAssistantDockClose,
  dispatchIncomingAddInboundClose,
  dispatchReceivingDetailsOverlayClose,
  dispatchStationDisplaysClose,
} from '@/utils/events';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';

/**
 * URL params owned by the Displays column (and legacy peer flags still cleared).
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
    // Compat — cleared whenever Displays opens / AI yields.
    'ticketView',
    'claimView',
  ],
} as const;

type UnboxRightEdgeSurface = keyof typeof UNBOX_RIGHT_EDGE_PARAMS;

/**
 * Drop every right-edge param except the surface being opened, **in the
 * caller's own `URLSearchParams`** — so the exclusion is ONE `router.replace`.
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

/** Drop every Unbox right-edge URL param (AI yield — no keep). */
export function clearAllUnboxRightEdgeParams(params: URLSearchParams): void {
  for (const names of Object.values(UNBOX_RIGHT_EDGE_PARAMS)) {
    for (const name of names) params.delete(name);
  }
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
 * Unbox twin of {@link useYieldStationDisplaysOnAssistantOpen}: clears URL peer
 * params (Displays + nested) in one write. Sibling stations use the hook with a
 * React-state `closeDisplays` only — mechanisms stay forked (C2).
 *
 * **One URL write:** pass `clearAllUrl` that runs {@link clearAllUnboxRightEdgeParams}
 * once. `clearDisplay` is a no-op alias for callers that still pass both.
 */
export function yieldUnboxStationPushesOnAssistantOpen(opts: {
  clearAllUrl: () => void;
  clearDisplay?: () => void;
  /** @deprecated Tool push retired — kept optional for one release of call sites. */
  closeToolPush?: () => void;
}): void {
  opts.clearAllUrl();
  opts.clearDisplay?.();
  opts.closeToolPush?.();
  dispatchIncomingAddInboundClose();
}

/**
 * Claim the right edge for Add inbound — one wrapper with Displays / details / AI.
 * Clears Unbox `?display=` (+ nested), closes Arrival Displays state, details, AI.
 */
export function yieldStationRightEdgeForAddInbound(replaceUrl?: (qs: string) => void): void {
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
      window.history.replaceState(null, '', after ? `${path}?${after}` : path);
    }
  }
  dispatchReceivingDetailsOverlayClose();
  dispatchAssistantDockClose();
  dispatchStationDisplaysClose();
}
