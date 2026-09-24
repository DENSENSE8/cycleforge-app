/**
 * What still stands between this visit and a receipt — as a pure function the
 * DESK can call, not just the server.
 *
 * This used to live in `session-store`, which imports `pg`. That put the gate
 * out of reach of the client, so the desk could only learn a visit was
 * unfinishable by pressing Pay and reading a 422 back. An operator standing in
 * front of a customer should see "needs a phone number" on the button itself,
 * before the card comes out of the wallet — same codes, same order, one
 * implementation. `session-store` re-exports it, so the server path is
 * unchanged and there is still exactly one answer to "can this be submitted".
 *
 * Returned as a CODE, not a sentence, so the desk, the tablet and the E2E all
 * name the same gate.
 */

import { isLinkedRepairLine, isRepairPayload } from '@/lib/kiosk/cart-line';
import type { CounterSessionSnapshot } from './session-events';

/**
 * The refusals a *staged cart* can carry, as opposed to the refusals a *write*
 * can carry (claim conflicts, version conflicts, a closed session). A strict
 * subset of `CounterSessionError`, so `session-store` can keep using it as a
 * write guard without widening anything.
 */
export type CounterSubmitBlocker = 'EMPTY_CART' | 'MISSING_CUSTOMER' | 'UNSIGNED_REPAIR';

/**
 * Order matters: an empty cart is the loudest problem, and telling someone
 * their repair is unsigned when there is nothing in the cart would send them to
 * fix the wrong thing.
 */
export function submitBlocker(snapshot: CounterSessionSnapshot): CounterSubmitBlocker | null {
  const live = snapshot.lines.filter((l) => l.voidedAtMs === null);
  if (live.length === 0) return 'EMPTY_CART';
  if (!snapshot.customer.phone.trim()) return 'MISSING_CUSTOMER';

  // A LINKED repair is exempt: it was signed for when its ticket was written,
  // and this visit only settles it.
  const unsigned = live.some(
    (l) =>
      l.type === 'REPAIR' &&
      isRepairPayload(l.payload) &&
      !isLinkedRepairLine(l) &&
      !l.payload.signatureDataUrl,
  );
  // A repair is a legal agreement about someone's property. An unsigned one is
  // not a slow path to fix later — it is a visit that must not be charged.
  if (unsigned) return 'UNSIGNED_REPAIR';

  return null;
}

/** The same gate, phrased for the person who has to clear it. */
export function submitBlockerCopy(blocker: CounterSubmitBlocker): string {
  switch (blocker) {
    case 'EMPTY_CART':
      return 'Add a line before taking payment.';
    case 'MISSING_CUSTOMER':
      return 'Needs a phone number before taking payment.';
    case 'UNSIGNED_REPAIR':
      return 'The repair still needs the customer’s signature.';
  }
}
