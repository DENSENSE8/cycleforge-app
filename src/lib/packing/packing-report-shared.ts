/**
 * Pure packing-report shapes + mappers (safe for client + unit tests).
 * DB query + CSV live in packing-report.ts (server-only via tenantQuery).
 */

export type PackTierSource = 'profile' | 'clean' | 'rules' | 'default';

export type PackingReportRow = {
  packedAt: string;
  packerName: string | null;
  sku: string | null;
  productTitle: string | null;
  packTier: string;
  estimatedMinutes: number;
  trackingType: string | null;
  trackingOrScanRef: string | null;
  itemNumber: string | null;
  skuCatalogId: number | null;
  tierSource: PackTierSource;
  packerLogId: number | null;
  salId: number;
};

export const PACKING_REPORT_COLUMNS: Array<{ key: keyof PackingReportRow; label: string }> = [
  { key: 'packedAt', label: 'Packed at' },
  { key: 'packerName', label: 'Packer' },
  { key: 'itemNumber', label: 'Item number' },
  { key: 'sku', label: 'SKU' },
  { key: 'productTitle', label: 'Product' },
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
  packer_name: string | null;
  sku: string | null;
  product_title: string | null;
  pack_tier: string;
  raw_pack_tier: string | null;
  estimated_minutes: number;
  tracking_type: string | null;
  tracking_or_scan_ref: string | null;
  item_number: string | null;
  sku_catalog_id: number | string | null;
  tier_source: string | null;
  packer_log_id: number | string | null;
  sal_id: number | string;
}): PackingReportRow {
  const skuCatalogRaw = r.sku_catalog_id == null ? null : Number(r.sku_catalog_id);
  const packerLogRaw = r.packer_log_id == null ? null : Number(r.packer_log_id);
  return {
    packedAt: r.packed_at,
    packerName: r.packer_name,
    sku: r.sku,
    productTitle: r.product_title,
    packTier: r.pack_tier,
    estimatedMinutes: Number(r.estimated_minutes) || 0,
    trackingType: r.tracking_type,
    trackingOrScanRef: r.tracking_or_scan_ref,
    itemNumber: r.item_number,
    skuCatalogId: skuCatalogRaw != null && Number.isFinite(skuCatalogRaw) ? skuCatalogRaw : null,
    tierSource: resolvePackTierSource(r.tier_source, r.raw_pack_tier),
    packerLogId: packerLogRaw != null && Number.isFinite(packerLogRaw) ? packerLogRaw : null,
    salId: Number(r.sal_id) || 0,
  };
}
