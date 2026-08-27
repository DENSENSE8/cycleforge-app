/**
 * Pure CSV → desk import row mapping (client + server safe).
 *
 * Supports:
 * - Cycle Forge desk CSV (kind, source, order_id, sku, …)
 * - Native Amazon Manage Returns / GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE
 *   (space or hyphen headers; ASIN is the catalog match key)
 */

export type DeskInboundKind = 'purchase' | 'return';

/** Why an Amazon returns row was not imported (client + server). */
export type AmazonReturnSkipReason =
  | 'cancelled'
  | 'no_asin'
  | 'no_order_id'
  | 'no_catalog_asin';

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
  /** Explicit sku_catalog.id from the Add Return inventory picker. */
  skuCatalogId?: number | null;
  /**
   * True when the row came from a native Amazon Manage Returns export.
   * Desk-import gates these on sku_catalog.sku = ASIN.
   */
  amazonNativeReturn?: boolean;
  /** Native Amazon ASIN (listing key); sku may be Merchant SKU when present. */
  amazonAsin?: string | null;
  /** Pre-ingest skip (e.g. Cancelled status) — no DB write. */
  skipReason?: AmazonReturnSkipReason | null;
  /** Full CSV record for inbound_purchase_order_mirror.raw_payload. */
  rawPayload?: Record<string, string> | null;
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

/** Case-insensitive header lookup with space/hyphen/underscore folding. */
function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function cell(
  record: Record<string, string>,
  ...aliases: string[]
): string | null {
  const entries = Object.entries(record);
  for (const alias of aliases) {
    const want = normalizeHeaderKey(alias);
    const hit = entries.find(([hk]) => normalizeHeaderKey(hk) === want);
    if (hit && hit[1]?.trim()) return hit[1].trim();
  }
  return null;
}

function hasHeader(record: Record<string, string>, ...aliases: string[]): boolean {
  const keys = Object.keys(record).map(normalizeHeaderKey);
  return aliases.some((a) => keys.includes(normalizeHeaderKey(a)));
}

const AMAZON_TRACKING_HEADERS = [
  'Tracking ID',
  'Tracking-ID',
  'Return tracking ID',
  'Return-tracking-ID',
  'Return Tracking ID',
  'Tracking Number',
  'Tracking-Number',
  'Carrier tracking',
] as const;

const AMAZON_RMA_HEADERS = ['Amazon RMA ID', 'Amazon-RMA-ID'] as const;

/** Seller Central placeholders that are not a carrier tracking number. */
function sanitizeInboundTracking(raw: string | null | undefined): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  if (/^(n\/?a|none|null|unknown|not\s*available|pending|-)$/i.test(t)) return null;
  return t;
}

/**
 * Detect Seller Central Manage Returns / flat-file returns export.
 * Requires ASIN + Order ID + (Amazon RMA ID or Tracking ID).
 */
export function isAmazonNativeReturnsRecord(
  record: Record<string, string>,
): boolean {
  const hasAsin = hasHeader(record, 'ASIN');
  const hasOrder = hasHeader(record, 'Order ID', 'Order-ID');
  const hasRmaOrTracking = hasHeader(
    record,
    ...AMAZON_RMA_HEADERS,
    ...AMAZON_TRACKING_HEADERS,
  );
  // Cycle Forge desk CSV uses `order_id` + `sku` / `kind` — not native Amazon.
  if (hasHeader(record, 'kind', 'source', 'source_type', 'platform')
    && hasHeader(record, 'order_id', 'order_number')) {
    return false;
  }
  return hasAsin && hasOrder && hasRmaOrTracking;
}

/** Build listing URL from ASIN when the CSV has none. */
export function amazonListingUrlForAsin(asin: string): string {
  return `https://www.amazon.com/dp/${asin.trim().toUpperCase()}`;
}

/**
 * Map one native Amazon returns CSV row → DeskImportRow.
 * Cancelled rows get skipReason=cancelled (no ingest).
 */
function deskRowFromAmazonReturnsRecord(
  record: Record<string, string>,
): DeskImportRow {
  const orderId = cell(record, 'Order ID', 'Order-ID') || '';
  const asin = cell(record, 'ASIN');
  const merchantSku = cell(record, 'Merchant SKU', 'Merchant-SKU');
  const rmaId = cell(record, ...AMAZON_RMA_HEADERS);
  const status = (cell(record, 'Return request status', 'Return-request-status') || '')
    .toLowerCase();
  const qtyRaw = cell(record, 'Return quantity', 'Return-quantity');
  const quantity = qtyRaw ? Math.max(1, Math.floor(Number(qtyRaw)) || 1) : 1;
  const itemName = cell(record, 'Item Name', 'Item-Name');
  const trackingNumber = sanitizeInboundTracking(cell(record, ...AMAZON_TRACKING_HEADERS));
  const carrierCode = cell(record, 'Return carrier', 'Return-carrier');
  const returnReason = cell(record, 'Return Reason', 'Return-Reason');

  let skipReason: AmazonReturnSkipReason | null = null;
  if (status === 'cancelled' || status === 'canceled') {
    skipReason = 'cancelled';
  } else if (!orderId) {
    skipReason = 'no_order_id';
  }

  const lineItemId =
    asin && rmaId
      ? `${rmaId}:${asin}`
      : asin
        ? asin
        : rmaId || null;

  return {
    kind: 'return',
    sourceType: 'amazon',
    sourcePlatform: 'amazon',
    receivingType: 'RETURN',
    orderId,
    lineItemId,
    sku: merchantSku || asin,
    amazonAsin: asin,
    itemName,
    quantity,
    trackingNumber,
    carrierCode,
    listingUrl: asin ? amazonListingUrlForAsin(asin) : null,
    rmaId,
    returnReason,
    amazonNativeReturn: true,
    skipReason,
    rawPayload: record,
  };
}

/** Normalize a CSV cell map into a desk import row (column names are flexible). */
export function deskRowFromCsvRecord(
  record: Record<string, string>,
): DeskImportRow {
  if (isAmazonNativeReturnsRecord(record)) {
    return deskRowFromAmazonReturnsRecord(record);
  }

  const get = (...keys: string[]) => cell(record, ...keys);

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
    trackingNumber: sanitizeInboundTracking(
      get('tracking', 'tracking_number', 'tracking_no', 'tracking_id'),
    ),
    listingUrl: get('listing_url', 'listing', 'url', 'asin_url'),
    seller: seller || (sourcePlatform === 'goodwill' ? 'Goodwill' : null),
    rmaId: get('rma_id', 'rma', 'rma_ref'),
    returnReason: get('return_reason', 'reason'),
    accountName: get('account', 'account_name', 'account_label'),
  };
}
