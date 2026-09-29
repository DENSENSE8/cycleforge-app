/**
 * Pure packing-report shapes + mappers (safe for client + unit tests).
 * DB query + CSV live in packing-report.ts (server-only via tenantQuery).
 */

export type PackTierSource = 'profile' | 'clean' | 'rules' | 'default';

export type PackingReportRow = {
  packedAt: string;
  /** Elapsed capture session, or completion-to-completion cycle when a session start was not recorded. */
  packDurationSeconds: number | null;
  /** Gap from this completion to the same packer's next completed pack that day. */
  nextPackSeconds: number | null;
  packerName: string | null;
  sku: string | null;
  productTitle: string | null;
  packTier: string;
  estimatedMinutes: number;
  trackingType: string | null;
  trackingOrScanRef: string | null;
  /** The order's own number, or null when the pack scan never resolved to an order row. */
  orderNumber: string | null;
  /** The packer's `staff.id`. */
  packerStaffId: number | null;
  /**
   * The order's marketplace / channel (`orders.account_source`). The shared Id
   * chip resolves its platform mark from this, so without it the order number
   * paints without the coloured channel dot its peers have.
   */
  platform: string | null;
  quantity: number;
  imageUrl: string | null;
  itemNumber: string | null;
  skuCatalogId: number | null;
  tierSource: PackTierSource;
  packerLogId: number | null;
  salId: number;
};

/** Global-header Find over every operator-facing packing report identity/fact. */
export function packingReportMatchesQuery(row: PackingReportRow, rawQuery: string): boolean {
  const tokens = rawQuery
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const searchable = [
    row.packerName,
    row.packerStaffId,
    row.sku,
    row.itemNumber,
    row.productTitle,
    row.orderNumber,
    row.trackingOrScanRef,
    row.platform,
    row.quantity,
    row.packTier,
    row.estimatedMinutes,
  ]
    .filter((value) => value != null)
    .join(' ')
    .toLowerCase();
  return tokens.every((token) => searchable.includes(token));
}

export const PACKING_REPORT_COLUMNS: Array<{ key: keyof PackingReportRow; label: string }> = [
  { key: 'packedAt', label: 'Packed at' },
  { key: 'packDurationSeconds', label: 'Pack duration seconds' },
  { key: 'nextPackSeconds', label: 'Time to next pack seconds' },
  { key: 'packerName', label: 'Packer' },
  { key: 'itemNumber', label: 'Item number' },
  { key: 'orderNumber', label: 'Order #' },
  { key: 'sku', label: 'SKU' },
  { key: 'productTitle', label: 'Product' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'platform', label: 'Platform' },
  { key: 'imageUrl', label: 'Product image' },
  { key: 'packTier', label: 'Pack tier' },
  { key: 'estimatedMinutes', label: 'Estimated minutes' },
  { key: 'tierSource', label: 'Tier source' },
  { key: 'skuCatalogId', label: 'Catalog id' },
  { key: 'packerLogId', label: 'Packer log id' },
  { key: 'trackingType', label: 'Tracking type' },
  { key: 'trackingOrScanRef', label: 'Tracking / scan ref' },
];

/** Normalize enrichment tier_source for KPI transparency. */
export function resolvePackTierSource(
  tierSource: string | null | undefined,
  rawPackTier: string | null | undefined,
): PackTierSource {
  const src = String(tierSource || '')
    .trim()
    .toLowerCase();
  if (src === 'profile' || src === 'clean' || src === 'rules') return src;
  if (rawPackTier == null || String(rawPackTier).trim() === '') return 'default';
  return 'rules';
}

export function mapPackingReportDbRow(r: {
  packed_at: string;
  pack_duration_seconds?: number | string | null;
  next_pack_seconds?: number | string | null;
  packer_name: string | null;
  sku: string | null;
  product_title: string | null;
  pack_tier: string;
  raw_pack_tier: string | null;
  estimated_minutes: number;
  tracking_type: string | null;
  tracking_or_scan_ref: string | null;
  order_number?: string | null;
  packer_staff_id?: number | string | null;
  platform?: string | null;
  quantity?: number | string | null;
  image_url?: string | null;
  item_number: string | null;
  sku_catalog_id: number | string | null;
  tier_source: string | null;
  packer_log_id: number | string | null;
  sal_id: number | string;
}): PackingReportRow {
  const skuCatalogRaw = r.sku_catalog_id == null ? null : Number(r.sku_catalog_id);
  const packerLogRaw = r.packer_log_id == null ? null : Number(r.packer_log_id);
  const staffRaw = r.packer_staff_id == null ? null : Number(r.packer_staff_id);
  const durationRaw = r.pack_duration_seconds == null ? null : Number(r.pack_duration_seconds);
  const nextPackRaw = r.next_pack_seconds == null ? null : Number(r.next_pack_seconds);
  const quantityRaw = Number(r.quantity ?? 1);
  return {
    packedAt: r.packed_at,
    packDurationSeconds:
      durationRaw != null && Number.isFinite(durationRaw) && durationRaw >= 0 ? Math.round(durationRaw) : null,
    nextPackSeconds:
      nextPackRaw != null && Number.isFinite(nextPackRaw) && nextPackRaw >= 0 ? Math.round(nextPackRaw) : null,
    packerName: r.packer_name,
    sku: r.sku,
    productTitle: r.product_title,
    packTier: r.pack_tier,
    estimatedMinutes: Number(r.estimated_minutes) || 0,
    trackingType: r.tracking_type,
    trackingOrScanRef: r.tracking_or_scan_ref,
    // `?? null` rather than a fallback to the tracking: an absent order number
    // is the empty first line the operator asked for, not a place to reprint
    // the tracking.
    orderNumber: r.order_number ?? null,
    packerStaffId: staffRaw != null && Number.isFinite(staffRaw) && staffRaw > 0 ? staffRaw : null,
    platform: String(r.platform ?? '').trim() || null,
    quantity: Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1,
    imageUrl: String(r.image_url ?? '').trim() || null,
    itemNumber: r.item_number,
    skuCatalogId: skuCatalogRaw != null && Number.isFinite(skuCatalogRaw) ? skuCatalogRaw : null,
    tierSource: resolvePackTierSource(r.tier_source, r.raw_pack_tier),
    packerLogId: packerLogRaw != null && Number.isFinite(packerLogRaw) ? packerLogRaw : null,
    salId: Number(r.sal_id) || 0,
  };
}
