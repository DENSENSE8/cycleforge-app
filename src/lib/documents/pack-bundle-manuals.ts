/**
 * Phase 2–3 bridge — resolve manuals for an order pack bundle.
 *
 * Phase 3 dual-read: prefer `documents` linked to the order's sku_catalog_id
 * (document_type='manual'); fall back to assigned `product_manuals` rows not
 * yet promoted.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { normalizeIdentifier } from '@/lib/product-manuals';
import { listManualDocumentsForOrder } from '@/lib/documents/manual-documents';

export interface PackBundleManual {
  /** product_manuals.id when known; otherwise documents.id stand-in. */
  id: number;
  /** documents.id when the manual lives on the documents SoT. */
  documentId?: number | null;
  displayName: string;
  sourceUrl: string | null;
  fileName: string | null;
  sku: string | null;
  itemNumber: string | null;
}

interface ManualRow {
  id: number | string;
  display_name: string | null;
  file_name: string | null;
  source_url: string | null;
  sku: string | null;
  item_number: string | null;
}

async function listLegacyAssignedManualsForOrder(
  orgId: OrgId,
  orderPkId: number,
): Promise<PackBundleManual[]> {
  const orderRes = await tenantQuery<{
    sku: string | null;
    item_number: string | null;
    sku_catalog_id: number | string | null;
  }>(
    orgId,
    `SELECT sku, item_number, sku_catalog_id
       FROM orders
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [orderPkId, orgId],
  );
  const order = orderRes.rows[0];
  if (!order) return [];

  const skuNorm = normalizeIdentifier(String(order.sku || ''));
  const itemNorm = normalizeIdentifier(String(order.item_number || ''));
  const catalogId =
    order.sku_catalog_id != null && Number(order.sku_catalog_id) > 0
      ? Number(order.sku_catalog_id)
      : null;

  if (!skuNorm && !itemNorm && catalogId == null) return [];

  const res = await tenantQuery<ManualRow>(
    orgId,
    `SELECT DISTINCT ON (pm.id)
            pm.id, pm.display_name, pm.file_name, pm.source_url, pm.sku, pm.item_number
       FROM product_manuals pm
      WHERE pm.is_active = TRUE
        AND pm.status = 'assigned'
        AND (
          ($1::int IS NOT NULL AND pm.sku_catalog_id = $1)
          OR (
            $2::text <> ''
            AND regexp_replace(UPPER(TRIM(COALESCE(pm.item_number, ''))), '[^A-Z0-9]', '', 'g') = $2
          )
          OR (
            $3::text <> ''
            AND regexp_replace(UPPER(TRIM(COALESCE(pm.sku, ''))), '[^A-Z0-9]', '', 'g') = $3
          )
        )
        AND (
          pm.organization_id IS NULL
          OR pm.organization_id = $4
        )
      ORDER BY pm.id, pm.updated_at DESC NULLS LAST`,
    [catalogId, itemNorm, skuNorm, orgId],
  );

  return res.rows.map((r) => ({
    id: Number(r.id),
    documentId: null,
    displayName:
      String(r.display_name || '').trim() ||
      String(r.file_name || '').trim() ||
      `Manual #${r.id}`,
    sourceUrl: r.source_url ? String(r.source_url).trim() : null,
    fileName: r.file_name ? String(r.file_name).trim() : null,
    sku: r.sku ? String(r.sku) : null,
    itemNumber: r.item_number ? String(r.item_number) : null,
  }));
}

/**
 * All manuals for the order's product identity (documents SoT first, then
 * product_manuals bridge). Dedupes by productManualId when both sources agree.
 */
export async function listAssignedManualsForOrder(
  orgId: OrgId,
  orderPkId: number,
): Promise<PackBundleManual[]> {
  const [fromDocs, fromLegacy] = await Promise.all([
    listManualDocumentsForOrder(orgId, orderPkId),
    listLegacyAssignedManualsForOrder(orgId, orderPkId),
  ]);

  const byPmId = new Map<number, PackBundleManual>();
  const docOnly: PackBundleManual[] = [];

  for (const d of fromDocs) {
    const row: PackBundleManual = {
      id: d.productManualId ?? d.documentId,
      documentId: d.documentId,
      displayName: d.displayName,
      sourceUrl: d.sourceUrl,
      fileName: d.fileName,
      sku: null,
      itemNumber: null,
    };
    if (d.productManualId != null && d.productManualId > 0) {
      byPmId.set(d.productManualId, row);
    } else {
      docOnly.push(row);
    }
  }

  for (const m of fromLegacy) {
    if (byPmId.has(m.id)) continue;
    byPmId.set(m.id, m);
  }

  return [...byPmId.values(), ...docOnly];
}

export async function readProductManualBytes(
  manual: PackBundleManual,
): Promise<{ bytes: Buffer; contentType: string; filename: string } | null> {
  const url = manual.sourceUrl;
  if (!url || !url.startsWith('http')) return null;

  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    const contentType =
      res.headers.get('content-type') ||
      (url.toLowerCase().includes('.pdf') ? 'application/pdf' : 'application/octet-stream');
    const ab = await res.arrayBuffer();
    return {
      bytes: Buffer.from(ab),
      contentType,
      filename: manual.fileName || `${manual.displayName}.pdf`,
    };
  } catch {
    return null;
  }
}
