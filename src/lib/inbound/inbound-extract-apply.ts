/**
 * Map extract-po API draft JSON onto Incoming Add form fields.
 * Empty extract values never clobber what the operator already typed.
 */

export type ExtractPoApiLine = {
  sku?: string | null;
  item_name?: string | null;
  quantity?: string | number | null;
  line_item_id?: string | null;
  listing_url?: string | null;
  sku_catalog_id?: number | null;
};

export type ExtractPoApiDraft = {
  platform?: string | null;
  order_id?: string | null;
  seller?: string | null;
  account_name?: string | null;
  tracking_number?: string | null;
  carrier_code?: string | null;
  listing_url?: string | null;
  return_reason?: string | null;
  rma_id?: string | null;
  lines?: ExtractPoApiLine[] | null;
};

export type InboundFormExtractPatch = {
  platform: string;
  orderId: string;
  seller: string;
  accountName: string;
  trackingNumber: string;
  carrierCode: string;
  listingUrl: string;
  returnReason: string;
  rmaId: string;
  sku: string;
  itemName: string;
  quantity: string;
  lineItemId: string;
};

function take(next: string, prev: string): string {
  const t = next.trim();
  return t ? t : prev;
}

function qtyString(raw: string | number | null | undefined, prev: string): string {
  if (raw == null || raw === '') return prev;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 1) return prev;
  return String(Math.floor(n));
}

export function inboundFormPatchFromExtractDraft(
  draft: ExtractPoApiDraft,
  current: InboundFormExtractPatch,
): InboundFormExtractPatch {
  const line = draft.lines?.find((l) => Boolean(String(l.sku ?? '').trim() || String(l.item_name ?? '').trim()))
    ?? draft.lines?.[0];
  const listingFromLine = String(line?.listing_url ?? '').trim();
  return {
    platform: take(String(draft.platform ?? ''), current.platform),
    orderId: take(String(draft.order_id ?? ''), current.orderId),
    seller: take(String(draft.seller ?? ''), current.seller),
    accountName: take(String(draft.account_name ?? ''), current.accountName),
    trackingNumber: take(String(draft.tracking_number ?? ''), current.trackingNumber),
    carrierCode: take(String(draft.carrier_code ?? ''), current.carrierCode),
    listingUrl: take(listingFromLine || String(draft.listing_url ?? ''), current.listingUrl),
    returnReason: take(String(draft.return_reason ?? ''), current.returnReason),
    rmaId: take(String(draft.rma_id ?? ''), current.rmaId),
    sku: take(String(line?.sku ?? ''), current.sku),
    itemName: take(String(line?.item_name ?? ''), current.itemName),
    quantity: qtyString(line?.quantity, current.quantity),
    lineItemId: take(String(line?.line_item_id ?? ''), current.lineItemId),
  };
}
