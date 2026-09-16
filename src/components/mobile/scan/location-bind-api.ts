'use client';

/**
 * The three network moves the `/m/scan` location-bind surface makes, away from
 * the component that sequences them.
 *
 * `unpairSku` is the one that is NOT a quick ±: it takes the entire quantity in
 * a single `take`, under its own `BIN_UNPAIR` reason, so the ledger says
 * "this SKU left this location" rather than "someone counted down to zero".
 * It deliberately does not go through the offline queue — unpairing is a
 * deliberate, confirmable act and the operator should learn immediately if the
 * radio is down, not discover it reconciled later.
 */

import { registerLocations } from '@/components/barcode/bin-label-printer/bin-printer-api';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { LocationSegments } from '@/lib/barcode-routing';
import type { LocationBindContent } from './location-bind-types';

/** Make sure the scanned sticker has a `locations` row before anything writes. */
export async function ensureRegistered(
  code: string,
  segs: LocationSegments,
): Promise<void> {
  const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.ok) return;
  if (res.status !== 404) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Location lookup failed (${res.status})`);
  }
  // Sticker scanned before print-register — mint the row under Zone {letter}.
  await registerLocations(`Zone ${segs.zone}`, [segs]);
}

/** What is in this location right now. An unknown location is empty, not an error. */
export async function fetchOccupancy(code: string): Promise<LocationBindContent[]> {
  const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Failed to load location (${res.status})`);
  }
  const json = (await res.json()) as {
    contents?: Array<{
      sku?: string;
      qty?: number;
      productTitle?: string | null;
    }>;
  };
  return (json.contents ?? [])
    .filter((c) => Number(c.qty) > 0 && c.sku)
    .map((c) => ({
      sku: String(c.sku),
      qty: Number(c.qty) || 0,
      productTitle: c.productTitle ?? null,
      imageUrl: null,
    }));
}

/** Take the whole quantity of one SKU out of this location. Throws on refusal. */
export async function unpairSku({
  code,
  sku,
  qty,
  staffId,
}: {
  code: string;
  sku: string;
  qty: number;
  staffId: number;
}): Promise<void> {
  const idempotencyKey = safeRandomUUID();
  const res = await fetch(`/api/locations/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      action: 'take',
      sku,
      qty,
      staffId,
      reason: 'BIN_UNPAIR',
      clientEventId: idempotencyKey,
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
  } | null;
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `Unpair failed (${res.status})`);
  }
}
