/** Scanned item barcode → the catalog SKU(s) it identifies, org-scoped. Read-only; backs `GET /api/sku-catalog/scanned-item`. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { normalizeSerial } from '@/lib/neon/serial-units-queries';
import { normalizeProvisionalBarcode } from '@/lib/inventory/provisional-sku';
import type { ScannedItemKey } from '@/lib/inventory/scanned-item-sku';

/** Cap on SKUs returned — a barcode names one product; a handful covers bad data. */
const SKU_LIMIT = 20;

/** GS1 lengths a stored UPC/EAN/GTIN may be written in. */
const GTIN_LENGTHS = [8, 12, 13, 14] as const;

/**
 * Every spelling a stored catalog barcode of this scan may have: as read,
 * upper-cased, the on-hold barcode form, and for a digit run each GS1 length
 * it zero-pads to (a UPC-A read matches a GTIN-14 stored `00…`, and back).
 */
export function catalogBarcodeVariants(value: string): string[] {
  const variants = new Set([value, value.toUpperCase()]);
  const provisional = normalizeProvisionalBarcode(value);
  if (provisional) variants.add(provisional);
  if (/^\d+$/.test(value)) {
    const significant = value.replace(/^0+/, '');
    for (const length of GTIN_LENGTHS) {
      if (significant.length <= length) variants.add(significant.padStart(length, '0'));
    }
  }
  return [...variants];
}

// SKU comes through sku_catalog_id when the row is linked (sku_catalog.id is
// the identity); the row's own SKU text is the fallback for unlinked rows.
const UNIT_SKU_SQL = `
  SELECT COALESCE(sc.sku, su.sku) AS sku
    FROM serial_units su
    LEFT JOIN sku_catalog sc ON sc.id = su.sku_catalog_id AND sc.organization_id = su.organization_id
   WHERE su.organization_id = $1
     AND (su.id = $2 OR su.normalized_serial = $3 OR su.unit_uid = $4)`;

const SQL_BY_KIND: Record<ScannedItemKey['kind'], string> = {
  fnsku: `
    SELECT DISTINCT COALESCE(sc.sku, ff.sku) AS sku
      FROM fba_fnskus ff
      LEFT JOIN sku_catalog sc ON sc.id = ff.sku_catalog_id AND sc.organization_id = ff.organization_id
     WHERE ff.organization_id = $1
       AND ff.fnsku = $2
     LIMIT ${SKU_LIMIT}`,
  unit: `SELECT DISTINCT sku FROM (${UNIT_SKU_SQL}) hit LIMIT ${SKU_LIMIT}`,
  // Three index-probed arms, not one OR: the on-hold barcode is indexed on
  // sku_stock (ux_sku_stock_provisional_barcode), not sku_catalog, and an OR
  // across the two would fall back to a seq scan of the catalog.
  barcode: `
    SELECT sku FROM (
      SELECT sc.sku
        FROM sku_catalog sc
       WHERE sc.organization_id = $1
         AND (sc.upc = ANY($5::text[])
           OR sc.ean = ANY($5::text[])
           OR sc.gtin = ANY($5::text[]))
      UNION
      SELECT ss.sku
        FROM sku_stock ss
       WHERE ss.organization_id = $1
         AND ss.is_provisional = true
         AND ss.provisional_barcode = ANY($5::text[])
      UNION
      ${UNIT_SKU_SQL}
    ) hit
    LIMIT ${SKU_LIMIT}`,
};

function paramsForKey(orgId: OrgId, key: ScannedItemKey): unknown[] {
  const value = key.value.trim();
  switch (key.kind) {
    case 'fnsku':
      return [orgId, value.toUpperCase()];
    case 'unit':
      // A numeric handle on a house unit label is the serial_units id.
      return [orgId, /^\d{1,15}$/.test(value) ? Number(value) : null, normalizeSerial(value), value];
    case 'barcode':
      // A bare digit read is never a row id — that is a label-handle affordance.
      return [orgId, null, normalizeSerial(value), value, catalogBarcodeVariants(value)];
  }
}

/** The SKUs a scanned item key identifies in this org (empty when none). */
export async function listSkusForScannedItem(orgId: OrgId, key: ScannedItemKey): Promise<string[]> {
  if (!key.value.trim()) return [];
  const { rows } = await tenantQuery<{ sku: string | null }>(
    orgId,
    SQL_BY_KIND[key.kind],
    paramsForKey(orgId, key),
  );
  return rows.flatMap((row) => (row.sku ? [row.sku] : []));
}
