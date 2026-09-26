/** Square Terminal (the POS stand) — the card-present request, as a domain call. */

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

/** The Terminal checkout body. */
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

/** Ask the stand to collect a card for a staged order. */
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

/** Square Terminal checkout status → our payment state. */
export function paymentStateForTerminalStatus(
  status: string,
): 'awaiting_card' | 'approved' | 'canceled' {
  const normalized = String(status ?? '').trim().toUpperCase();
  if (normalized === 'COMPLETED') return 'approved';
  if (normalized === 'CANCELED' || normalized === 'CANCEL_REQUESTED') return 'canceled';
  return 'awaiting_card';
}
