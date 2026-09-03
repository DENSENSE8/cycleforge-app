/**
 * Pair a library product_manual to a SKU catalog identity (order intake /
 * details — same write path QC uses via receiving-line resolve).
 *
 * Resolves or creates `sku_catalog`, sets `product_manuals.sku_catalog_id`,
 * and promotes into documents + SKU link so pack-print can find the manual.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { resolveOrCreateSkuCatalogId } from '@/lib/neon/sku-catalog-queries';
import {
  getProductManualById,
  setManualSkuCatalogId,
  type ProductManual,
} from '@/lib/neon/product-manuals-queries';
import { promoteProductManualToDocument } from '@/lib/documents/manual-documents';

export interface PairManualToSkuInput {
  orgId: OrgId;
  manualId: number;
  sku: string;
  productTitle?: string | null;
  itemNumber?: string | null;
  accountSource?: string | null;
  orderId?: string | null;
}

export type PairManualToSkuResult =
  | {
      ok: true;
      skuCatalogId: number;
      manual: ProductManual;
      documentId: number | null;
    }
  | { ok: false; status: 400 | 404 | 409; error: string };

export interface PairManualToSkuDeps {
  resolveOrCreateSkuCatalogId: typeof resolveOrCreateSkuCatalogId;
  getProductManualById: typeof getProductManualById;
  setManualSkuCatalogId: typeof setManualSkuCatalogId;
  promoteProductManualToDocument: typeof promoteProductManualToDocument;
}

const defaultDeps: PairManualToSkuDeps = {
  resolveOrCreateSkuCatalogId,
  getProductManualById,
  setManualSkuCatalogId,
  promoteProductManualToDocument,
};

export async function pairManualToSku(
  input: PairManualToSkuInput,
  deps: PairManualToSkuDeps = defaultDeps,
): Promise<PairManualToSkuResult> {
  const sku = String(input.sku || '').trim();
  if (!sku) {
    return { ok: false, status: 400, error: 'SKU is required to pair a manual' };
  }
  if (!Number.isFinite(input.manualId) || input.manualId <= 0) {
    return { ok: false, status: 400, error: 'manualId is required' };
  }

  const existing = await deps.getProductManualById(input.manualId, input.orgId);
  if (!existing || !existing.is_active) {
    return { ok: false, status: 404, error: 'manual not found' };
  }

  const skuCatalogId = await deps.resolveOrCreateSkuCatalogId(
    {
      sku,
      itemNumber: input.itemNumber,
      productTitle: input.productTitle || existing.product_title || sku,
      accountSource: input.accountSource,
      orderId: input.orderId,
    },
    input.orgId,
  );
  if (skuCatalogId == null) {
    return {
      ok: false,
      status: 409,
      error: 'could not resolve or create a catalog entry for this SKU',
    };
  }

  const manual = await deps.setManualSkuCatalogId(
    input.manualId,
    skuCatalogId,
    input.orgId,
  );
  if (!manual) {
    return { ok: false, status: 404, error: 'manual not found' };
  }

  let documentId: number | null = null;
  try {
    const promoted = await deps.promoteProductManualToDocument(
      input.orgId,
      input.manualId,
      skuCatalogId,
    );
    documentId = promoted?.documentId ?? null;
  } catch {
    // Dual-write is best-effort; library pairing still succeeded.
  }

  return { ok: true, skuCatalogId, manual, documentId };
}
