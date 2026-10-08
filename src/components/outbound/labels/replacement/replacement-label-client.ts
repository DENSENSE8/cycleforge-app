'use client';

/**
 * The replacement form's I/O: the rate quote, the purchase (idempotent, held
 * behind an unread buyer note), and the per-staff remembered carrier.
 */

import { sendWithBuyerNoteAck } from '@/lib/orders/buyer-note-ack-client';
import {
  carrierFacets,
  carrierKey,
  lastCarrierStorageKey,
  type ReplacementReason,
} from '@/lib/shipping/replacement-rate-shop';
import type { ShippingRateOption } from '@/lib/shipping/shipstation/types';
import type { ReplacementPurchase } from './ReplacementBoughtCard';

export interface ReplacementRatesResponse {
  ok: boolean;
  rates?: ShippingRateOption[];
  invalidRates?: Array<{ carrierCode?: string | null; serviceCode?: string | null; message: string }>;
  error?: string;
}

/** One rate-shop request and the inputs it was quoted for (a later edit makes the quote stale). */
export interface ReplacementRatesRequest {
  signature: string;
  body: {
    orderId: number;
    purpose: 'outbound' | 'replacement';
    weightOz: number;
    dimensions: { length: number; width: number; height: number; unit: 'inch' };
    insuredValue?: { amount: number; currency: string };
  };
}

/** `POST /api/shipping/order-rates` for the parcel (outbound or replacement purpose). */
export async function fetchReplacementRates(body: ReplacementRatesRequest['body']): Promise<ReplacementRatesResponse> {
  const res = await fetch('/api/shipping/order-rates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as ReplacementRatesResponse;
  if (!res.ok || !data.ok) throw new Error(data.error || 'Could not fetch rates.');
  return data;
}

/**
 * `POST /api/shipping/order-labels/purchase` with the purpose (`outbound` — the
 * order's first label — or `replacement`) — the label lands on the order's
 * label list; a replacement's reason + note ride to the label ledger and the
 * order note. `clientEventId` is one per INTENDED
 * purchase, reused on a retry (the route claims it before charging, so a
 * retry replays instead of buying twice). A held order (buyer note) opens the
 * note before the irreversible purchase.
 */
export async function purchaseReplacementLabel(input: {
  orderId: number;
  purpose: 'outbound' | 'replacement';
  rateId: string;
  clientEventId: string;
  reason: ReplacementReason | null;
  note: string;
}): Promise<ReplacementPurchase> {
  const note = input.note.trim();
  const res = await sendWithBuyerNoteAck(() =>
    fetch('/api/shipping/order-labels/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: input.orderId,
        rateId: input.rateId,
        clientEventId: input.clientEventId,
        purpose: input.purpose,
        notifyCustomer: false,
        ...(input.purpose === 'replacement' && input.reason ? { replacementReason: input.reason } : {}),
        ...(input.purpose === 'replacement' && note ? { replacementNote: note } : {}),
      }),
    }),
  );
  const data = (await res.json()) as ReplacementPurchase;
  if (!res.ok || !data.ok) throw new Error(data.error || 'Purchase failed.');
  return data;
}

/** The carrier chip to preselect: the one this staffer last bought on, when the quote returned it; else all. */
export function rememberedCarriers(staffId: number | null, rates: readonly ShippingRateOption[]): ReadonlySet<string> {
  let remembered: string | null;
  try {
    remembered = window.localStorage.getItem(lastCarrierStorageKey(staffId));
  } catch {
    return new Set();
  }
  return remembered && carrierFacets(rates).some((facet) => facet.key === remembered) ? new Set([remembered]) : new Set();
}

/** A buy landed on `rate` — the next quote preselects its carrier. */
export function rememberCarrier(staffId: number | null, rate: ShippingRateOption): void {
  try {
    window.localStorage.setItem(lastCarrierStorageKey(staffId), carrierKey(rate));
  } catch {
    // Private mode / full storage: the preselect is a convenience.
  }
}
