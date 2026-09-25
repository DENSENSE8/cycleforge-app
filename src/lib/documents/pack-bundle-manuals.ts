/**
 * Manuals / paperwork for an order pack bundle.
 *
 * The live `product_manuals` resolution (`listOrderPaperworkForPrint` — pinned
 * to the order, its item number or its SKU, in that precedence) is the SoT: a
 * rename, replace, re-pair, unpair or delete in the paperwork walk is exactly
 * what prints. `documents` manual rows linked to the order's sku_catalog_id
 * that carry a productManualId are projections of those rows and are skipped;
 * document-only manuals (no productManualId) still print after them.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { listManualDocumentsForOrder } from '@/lib/documents/manual-documents';
import { listOrderPaperworkForPrint } from '@/lib/manuals/order-manuals';

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

/** Every manual pack prints for the order: live paperwork first, then document-only manuals. */
export async function listAssignedManualsForOrder(
  orgId: OrgId,
  orderPkId: number,
): Promise<PackBundleManual[]> {
  const [paperwork, fromDocs] = await Promise.all([
    listOrderPaperworkForPrint(orgId, orderPkId),
    listManualDocumentsForOrder(orgId, orderPkId),
  ]);
  const docOnly = fromDocs
    .filter((d) => d.productManualId == null || d.productManualId <= 0)
    .map((d): PackBundleManual => ({
      id: d.documentId,
      documentId: d.documentId,
      displayName: d.displayName,
      sourceUrl: d.sourceUrl,
      fileName: d.fileName,
      sku: null,
      itemNumber: null,
    }));
  return [...paperwork.map((m): PackBundleManual => ({ ...m, documentId: null })), ...docOnly];
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
