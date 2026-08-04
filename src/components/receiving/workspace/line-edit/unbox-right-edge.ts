/**
 * Unbox right-edge secondary surfaces — one at a time.
 *
 * Displays (`?display=<tab>`) ∪ Claim (`?claimView=1`) ∪ Ticket
 * (`?ticketView=1`) ∪ Tool push (move-photos / photo-note / audit) ∪
 * `detail:receiving` are mutually exclusive. Opening any one clears/suspends
 * the others.
 *
 * **AI (header Sparkles) shares the product “one right details column” law**
 * (source-of-truth → Right-rail modality · Frame column budget): opening the
 * assistant yields every Unbox station push; opening a station push closes the
 * assistant via {@link dispatchAssistantDockClose}.
 */

import { dispatchReceivingDetailsOverlayClose } from '@/utils/events';

/**
 * The URL half of the exclusion. Three surfaces own params on the same route,
 * so the param names live HERE rather than being re-typed in each hook — a
 * fourth surface that forgets one is exactly how two columns end up open.
 */
export const UNBOX_RIGHT_EDGE_PARAMS = {
  ticket: ['ticketView'],
  claim: ['claimView', 'claimMode'],
  display: ['display'],
} as const;

type UnboxRightEdgeSurface = keyof typeof UNBOX_RIGHT_EDGE_PARAMS;

/**
 * Drop every right-edge param except the surface being opened, **in the
 * caller's own `URLSearchParams`** — so the exclusion is ONE `router.replace`.
 *
 * WHY IT MUST BE ONE WRITE: each hook builds its next URL from the
 * `searchParams` snapshot it rendered with. Two hooks reacting to the same open
 * (one setting its param, another clearing its own) both write from that stale
 * snapshot, and the second `replace` resurrects what the first deleted. That is
 * how `?display=` survived opening Claim — the panel's clear effect raced
 * `setClaimView` and lost. Clear peers inline; never in a sibling effect.
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

/** Clear Claim + Ticket URL params and suspend receiving More details. */
export function clearUnboxPeerRightEdgeSurfaces(opts: {
  setClaimView: (on: boolean) => void;
  setTicketView: (on: boolean) => void;
  claimView: boolean;
  ticketView: boolean;
}): void {
  if (opts.claimView) opts.setClaimView(false);
  if (opts.ticketView) opts.setTicketView(false);
  dispatchReceivingDetailsOverlayClose();
}

/**
 * AI dock just opened (false→true) — yield every Unbox station right-edge surface.
 *
 * Pure side-effect helper so the transition rule unit-tests without mounting
 * `LineEditPanel`. Callers must gate on the transition themselves: staying open
 * must not clear a station push that just closed AI.
 *
 * **One URL write:** never call `setTicketView(false)` + `setClaimView(false)`
 * as two `router.replace`s — each builds from the same stale `searchParams`
 * snapshot and the second write resurrects what the first deleted (same race
 * `clearPeerRightEdgeParams` documents). Pass `clearAllUrl` that runs
 * {@link clearAllUnboxRightEdgeParams} once.
 */
export function yieldUnboxStationPushesOnAssistantOpen(opts: {
  clearAllUrl: () => void;
  clearDisplay: () => void;
  closeToolPush: () => void;
}): void {
  opts.clearAllUrl();
  opts.clearDisplay();
  opts.closeToolPush();
}
