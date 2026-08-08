/**
 * Pure CSV → desk import row mapping (client + server safe).
 */

export type DeskInboundKind = 'purchase' | 'return';

export interface DeskImportRow {
  kind: DeskInboundKind;
  /** Registered inbound source: amazon | ebay | manual | zoho. */
  sourceType: string;
  /**
   * Spine paint platform (`receiving_line.source_platform`) — amazon, ebay,
   * goodwill, walmart, … Distinct from `sourceType` when goodwill/other map
   * to manual ingest.
   */
  sourcePlatform?: string | null;
  /** Catalog receiving_type slug (PO · RETURN · TRADE_IN · …). */
  receivingType?: string | null;
  /** Manual priority_tier (0..3); null/omit = Auto. */
  priorityTier?: number | null;
  orderId: string;
  lineItemId?: string | null;
  sku?: string | null;
  itemName?: string | null;
  quantity?: number;
  trackingNumber?: string | null;
  carrierCode?: string | null;
  seller?: string | null;
  listingUrl?: string | null;
  accountName?: string | null;
  returnReason?: string | null;
  rmaId?: string | null;
  conditionGrade?: string | null;
}

/** Map UI / CSV platform token → registered ingest `source_type`. */
export function inboundSourceTypeForPlatform(raw: string): 'amazon' | 'ebay' | 'manual' | 'zoho' {
  const p = String(raw || '').trim().toLowerCase();
  if (p === 'amz' || p === 'amazon' || p === 'fba') return 'amazon';
  if (p === 'ebay' || p === 'e-bay') return 'ebay';
  if (p === 'zoho') return 'zoho';
  // Goodwill, Walmart, Shopify, bare "manual", … → manual ingest + platform stamp.
  return 'manual';
}

/** Normalize CSV/UI token → `source_platform` paint value (or null). */
export function inboundSourcePlatformForRaw(raw: string): string | null {
  const p = String(raw || '').trim().toLowerCase();
  if (!p || p === 'manual' || p === 'other' || p === 'zoho') return null;
  if (p === 'amz' || p === 'fba') return 'amazon';
  if (p === 'e-bay') return 'ebay';
  return p;
}

/** Normalize a CSV cell map into a desk import row (column names are flexible). */
export function deskRowFromCsvRecord(
  record: Record<string, string>,
): DeskImportRow {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const hit = Object.entries(record).find(
        ([hk]) => hk.trim().toLowerCase() === k.toLowerCase(),
      );
      if (hit && hit[1]?.trim()) return hit[1].trim();
    }
    return null;
  };

  const kindRaw = (get('kind', 'type', 'intake') || 'purchase').toLowerCase();
  const receivingTypeRaw = get('receiving_type', 'intake_type');
  const receivingType = receivingTypeRaw
    ? receivingTypeRaw.trim().toUpperCase()
    : kindRaw === 'return' || kindRaw === 'returns'
      ? 'RETURN'
      : null;
  const kind: DeskInboundKind =
    receivingType === 'RETURN' || kindRaw === 'return' || kindRaw === 'returns'
      ? 'return'
      : 'purchase';

  const sourceRaw = get('source', 'source_type', 'platform') || 'manual';
  const sourceType = inboundSourceTypeForPlatform(sourceRaw);
  const sourcePlatform = inboundSourcePlatformForRaw(sourceRaw);

  const qtyRaw = get('qty', 'quantity', 'quantity_expected');
  const quantity = qtyRaw ? Math.max(1, Math.floor(Number(qtyRaw)) || 1) : 1;

  const priorityRaw = get('priority', 'priority_tier', 'urgency');
  let priorityTier: number | null = null;
  if (priorityRaw && priorityRaw.toLowerCase() !== 'auto') {
    const n = Number(priorityRaw);
    if (Number.isInteger(n) && n >= 0 && n <= 3) priorityTier = n;
  }

  const seller = get('seller', 'vendor', 'vendor_or_seller_name');

  return {
    kind,
    sourceType,
    sourcePlatform,
    receivingType,
    priorityTier,
    orderId: get('order_id', 'order_number', 'po', 'po_number', 'source_order_id') || '',
    sku: get('sku'),
    itemName: get('item_name', 'title', 'item', 'name'),
    quantity,
    trackingNumber: get('tracking', 'tracking_number', 'tracking_no'),
    listingUrl: get('listing_url', 'listing', 'url', 'asin_url'),
    seller: seller || (sourcePlatform === 'goodwill' ? 'Goodwill' : null),
    rmaId: get('rma_id', 'rma', 'rma_ref'),
    returnReason: get('return_reason', 'reason'),
    accountName: get('account', 'account_name', 'account_label'),
  };
}
