/**
 * Browser calls for purchase-order intake — document extraction and confirm.
 * Every PO intake surface (the Unbox band and the /incoming order composer)
 * posts through here so the wire shape lives in one place.
 */

import type { PoIntakeDraft } from '@/lib/inbound/po-intake-draft';

export async function readFileAsDataUrl(file: File): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ''));
  reader.onerror = () => reject(reader.error ?? new Error('read failed'));
  reader.readAsDataURL(file);
  return promise;
}

function draftFromApiPayload(payload: {
  platform?: string;
  order_id?: string;
  seller?: string;
  account_name?: string;
  tracking_number?: string;
  carrier_code?: string;
  priority?: string;
  notes?: string;
  lines?: Array<{
    sku?: string;
    item_name?: string;
    quantity?: string;
    line_item_id?: string;
    listing_url?: string;
  }>;
}): PoIntakeDraft {
  return {
    platform: payload.platform?.trim() || 'amazon',
    orderId: payload.order_id?.trim() || '',
    seller: payload.seller?.trim() || '',
    accountName: payload.account_name?.trim() || '',
    trackingNumber: payload.tracking_number?.trim() || '',
    carrierCode: payload.carrier_code?.trim() || '',
    priority: payload.priority?.trim() || 'auto',
    notes: payload.notes?.trim() || '',
    lines:
      payload.lines && payload.lines.length > 0
        ? payload.lines.map((l) => ({
            sku: l.sku?.trim() || '',
            itemName: l.item_name?.trim() || '',
            quantity: l.quantity?.trim() || '',
            lineItemId: l.line_item_id?.trim() || '',
            listingUrl: l.listing_url?.trim() || '',
          }))
        : [{ sku: '', itemName: '', quantity: '', lineItemId: '', listingUrl: '' }],
  };
}

export async function postPoIntakeExtract(opts: {
  text?: string;
  imageDataUrl?: string | null;
  imageDataUrls?: string[];
}): Promise<{
  draft: PoIntakeDraft;
  ready: boolean;
  missing_prompt?: string;
}> {
  const res = await fetch('/api/receiving/inbound/extract-po', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: opts.text?.trim() || null,
      image_data_url: opts.imageDataUrl || null,
      image_data_urls: opts.imageDataUrls?.length ? opts.imageDataUrls : null,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Extract failed (${res.status})`);
  }
  return {
    draft: draftFromApiPayload(data.draft ?? {}),
    ready: Boolean(data.ready),
    missing_prompt: data.missing_prompt,
  };
}

export async function postPoIntakeConfirm(
  draft: PoIntakeDraft,
): Promise<{ created: number; updated: number }> {
  const res = await fetch('/api/receiving/inbound/confirm-po', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      platform: draft.platform,
      order_id: draft.orderId,
      seller: draft.seller,
      account_name: draft.accountName,
      tracking_number: draft.trackingNumber,
      carrier_code: draft.carrierCode,
      priority: draft.priority,
      lines: draft.lines.map((l) => ({
        sku: l.sku,
        item_name: l.itemName,
        quantity: l.quantity,
        line_item_id: l.lineItemId,
        listing_url: l.listingUrl,
      })),
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Confirm failed (${res.status})`);
  }
  return {
    created: Number(data.created ?? 0),
    updated: Number(data.updated ?? 0),
  };
}
