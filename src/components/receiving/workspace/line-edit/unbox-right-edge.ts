/**
 * Unbox right-edge secondary surfaces — one at a time.
 *
 * Claim (`?claimView=1`) ∪ Ticket (`?ticketView=1`) ∪ Tool push (move-photos /
 * photo-note / audit) ∪ `detail:receiving` are mutually exclusive. Opening any
 * one clears/suspends the others.
 */

import { dispatchReceivingDetailsOverlayClose } from '@/utils/events';

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
