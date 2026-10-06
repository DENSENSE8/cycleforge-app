/**
 * The desk import row (client + server safe): one mapped file row, the shape
 * the batch runner groups into orders (`draftsFromDeskRows`). Built only by
 * the import engine (`poRowToDeskRow`, `po-columns.ts`). Also the platform
 * token maps every inbound face shares.
 */

import type { ConditionGrade } from '@/lib/conditions';

export interface DeskImportRow {
  /** Registered inbound source: amazon | ebay | manual | zoho. */
  sourceType: string;
  /**
   * Spine paint platform (`receiving_line.source_platform`) — amazon, ebay,
   * goodwill, walmart, … Distinct from `sourceType` when goodwill/other map
   * to manual ingest.
   */
  sourcePlatform: string | null;
  /** The order type the row lands as. */
  receivingType: 'PO' | 'RETURN';
  /** Manual priority_tier (0..3); null = Auto. */
  priorityTier: number | null;
  orderId: string;
  /** The line key the row lands with (the preset's rule); null = by position. */
  lineItemId: string | null;
  sku: string | null;
  itemName: string | null;
  /** Null = the file had a quantity column whose cell was blank — asked for, never assumed. */
  quantity: number | null;
  unitCostCents: number | null;
  /** Marketplace item / listing number (eBay item, ASIN, Goodwill lot). */
  itemNumber: string | null;
  /** Civil dates YYYY-MM-DD — the order's first row that has one wins. */
  orderDate: string | null;
  expectedDate: string | null;
  /** Order-level note fragments (shipping, notes); unique fragments are joined. */
  notes: string | null;
  trackingNumber: string | null;
  carrierCode: string | null;
  seller: string | null;
  listingUrl: string | null;
  /** Return report facts — the raw reason code is kept (decoded on read). */
  returnReason: string | null;
  rmaId: string | null;
  returnRequestDate: string | null;
  /** The grade the item was bought at (listing condition). */
  conditionGrade: ConditionGrade | null;
  listingSerials: string[];
  fnsku: string | null;
  licensePlateNumber: string | null;
  disposition: string | null;
  customerComment: string | null;
  /** Needles tried against `sku_catalog.sku`, in order (Amazon: Merchant SKU, then ASIN); [] = no lookup. */
  catalogLookup: string[];
  /** Why the preset skips the row (no write); null = lands. */
  skipReason: string | null;
  /** The file row as uploaded — `inbound_purchase_order_mirror.raw_payload`. */
  rawPayload: Record<string, string>;
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
