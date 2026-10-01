'use client';

import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';

interface TempSkuInput {
  productTitle: string;
  description: string | null;
  sourceRef: string;
}

/** Mint an idempotent TMP SKU through the catalog's canonical provisional writer. */
export async function createTempSku(input: TempSkuInput): Promise<ProvisionalSku> {
  const res = await fetch('/api/sku-catalog/provisional', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    item?: ProvisionalSku;
  } | null;
  if (!res.ok || !data?.success || !data.item) {
    throw new Error(data?.error || `Could not create the temporary SKU (${res.status})`);
  }
  return data.item;
}

/**
 * Give an empty warehouse location a real zero-count TMP stock pair. Photos can
 * then use the existing SKU_STOCK upload, phone handoff and realtime pipeline.
 */
export async function createTempStockAtLocation(input: TempSkuInput & {
  barcode: string;
  staffId?: number;
}): Promise<ProvisionalSku> {
  const item = await createTempSku(input);
  const res = await fetch(`/api/locations/${encodeURIComponent(input.barcode)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'set',
      sku: item.sku,
      qty: 0,
      staffId: input.staffId,
      reason: 'TMP_PHOTO',
      notes: 'Temporary SKU created for empty-location photos',
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    message?: string;
  } | null;
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || data?.error || `Could not pair the temporary SKU (${res.status})`);
  }
  return item;
}
