/**
 * Square Terminal (the POS stand) — the card-present request, as a domain call.
 *
 * The Terminal API was already spoken in `/api/walk-in/terminal/checkout`, but
 * only there: a staff route, admin-origin gated, taking a raw `order_id`. The
 * counter could stage an order and never send it to the stand, which is why
 * `awaitingCardSinceMs` has existed on the kiosk store since v2 with nothing
 * driving it.
 *
 * This is that call as a function the counter session can make. The request
 * SHAPE is split out pure (`buildTerminalCheckoutBody`) because it is the part
 * that is easy to get subtly wrong — a missing `payment_type`, a device id from
 * the wrong place — and impossible to check by reading a fetch call.
 *
 * ## The device id is still env-global, and that is a known gap
 *
 * `SQUARE_TERMINAL_DEVICE_ID` means one stand per deployment: a tenant with two
 * lanes, or two tenants on one deploy, cannot both work. SQ3 moves it onto
 * `kiosk_devices` where the counter already pairs its tablet. Until then the
 * caller may pass one explicitly, and this module never reads the env itself —
 * so when SQ3 lands, the fallback disappears from ONE place.
 *
 * Plan: `docs/todo/counter-square-enterprise-PLAN.md` (SQ2 · G2 · G3).
 */

import { squareFetchForOrg } from '@/lib/square/server';
import { formatSquareErrors } from '@/lib/square/client';
import type { OrgId } from '@/lib/tenancy/constants';

export interface TerminalCheckoutRequest {
  deviceId: string;
  /** The staged Square order this checkout collects for. */
  orderId: string;
  /** Idempotency key — the CALLER's, so a retry is the caller's decision. */
  idempotencyKey: string;
}

/**
 * The Terminal checkout body.
 *
 * `collect_signature: true` and `skip_receipt_screen: false` match the existing
 * walk-in call rather than inventing a second house answer — a customer who
 * signs on the stand for one sale and not another is a support ticket.
 */
export function buildTerminalCheckoutBody(req: TerminalCheckoutRequest): Record<string, unknown> {
  return {
    idempotency_key: req.idempotencyKey,
    checkout: {
      device_options: {
        device_id: req.deviceId,
        skip_receipt_screen: false,
        collect_signature: true,
      },
      order_id: req.orderId,
      payment_type: 'CARD_PRESENT',
    },
  };
}

export type TerminalCheckoutResult =
  | { ok: true; checkoutId: string }
  | { ok: false; error: string };

/**
 * Ask the stand to collect a card for a staged order.
 *
 * Returns a result rather than throwing: the caller is a counter verb whose job
 * is to tell an operator what happened, and "Square said no" is information,
 * not an exception.
 */
export async function createTerminalCheckout(
  orgId: OrgId,
  req: TerminalCheckoutRequest,
): Promise<TerminalCheckoutResult> {
  if (!req.deviceId) {
    return { ok: false, error: 'No Square Terminal is paired with this counter.' };
  }

  const res = await squareFetchForOrg<{ checkout?: { id?: string } }>(
    orgId,
    '/terminals/checkouts',
    { method: 'POST', body: buildTerminalCheckoutBody(req) },
  );

  const checkoutId = res.data?.checkout?.id;
  if (!res.ok || !checkoutId) {
    return { ok: false, error: formatSquareErrors(res.errors) || 'Square declined the request.' };
  }
  return { ok: true, checkoutId };
}

/**
 * Square Terminal checkout status → our payment state.
 *
 * Their vocabulary: PENDING · IN_PROGRESS · CANCEL_REQUESTED · CANCELED ·
 * COMPLETED. Anything unrecognised stays `awaiting_card` — an unknown status is
 * not an outcome, and guessing "declined" would put a cart back in front of a
 * customer whose card may well have gone through.
 */
export function paymentStateForTerminalStatus(
  status: string,
): 'awaiting_card' | 'approved' | 'canceled' {
  const normalized = String(status ?? '').trim().toUpperCase();
  if (normalized === 'COMPLETED') return 'approved';
  if (normalized === 'CANCELED' || normalized === 'CANCEL_REQUESTED') return 'canceled';
  return 'awaiting_card';
}
