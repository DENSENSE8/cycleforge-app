/**
 * Manual documents domain (JIT pack Phase 3).
 *
 * Promotes / links product_manuals into `documents` (document_type='manual')
 * with document_entity_links.entity_type='SKU' → sku_catalog.id.
 * product_manuals remains the library write SoT; this module is the pack/print
 * + Testing dual-read projection.
 */

import { withTenantTransaction, tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { createDocumentEntityLink } from '@/lib/documents/links';
import { getProductManualById } from '@/lib/neon/product-manuals-queries';

export interface ManualDocumentRow {
  documentId: number;
  productManualId: number | null;
  displayName: string;
  sourceUrl: string | null;
  fileName: string | null;
  manualType: string | null;
  skuCatalogId: number | null;
}

export interface ManualDocumentDeps {
  withTenantTransaction: typeof withTenantTransaction;
  createDocumentEntityLink: typeof createDocumentEntityLink;
  getProductManualById: typeof getProductManualById;
}

const defaultDeps: ManualDocumentDeps = {
  withTenantTransaction,
  createDocumentEntityLink,
  getProductManualById,
};

function displayFromData(data: Record<string, unknown>, fallbackId: number): string {
  const name = String(data.displayName || data.filename || '').trim();
  return name || `Manual #${fallbackId}`;
}

/**
 * Ensure a product_manuals row is projected into documents + SKU link.
 * Idempotent on (org, document_type=manual, productManualId).
 */
export async function promoteProductManualToDocument(
  orgId: OrgId,
  productManualId: number,
  skuCatalogId: number,
  deps: ManualDocumentDeps = defaultDeps,
): Promise<ManualDocumentRow | null> {
  const manual = await deps.getProductManualById(productManualId, orgId);
  if (!manual || !manual.is_active) return null;

  const sourceUrl = String(manual.source_url || '').trim() || null;
  const displayName =
    String(manual.display_name || '').trim() ||
    String(manual.file_name || '').trim() ||
    `Manual #${productManualId}`;
  const fileName = String(manual.file_name || '').trim() || null;

  return deps.withTenantTransaction(orgId, async (client) => {
    const existing = await client.query<{ id: number; document_data: Record<string, unknown> }>(
      `SELECT id, document_data FROM documents
        WHERE organization_id = $1
          AND document_type = 'manual'
          AND (document_data->>'productManualId') = $2
        LIMIT 1`,
      [orgId, String(productManualId)],
    );

    let documentId: number;
    if (existing.rows[0]) {
      documentId = Number(existing.rows[0].id);
      if (sourceUrl) {
        await client.query(
          `UPDATE documents
              SET document_data = document_data
                    || jsonb_build_object(
                         'url', $3::text,
                         'displayName', $4::text,
                         'filename', COALESCE($5::text, document_data->>'filename'),
                         'manualType', $6::text
                       ),
                  updated_at = NOW()
            WHERE id = $1 AND organization_id = $2`,
          [documentId, orgId, sourceUrl, displayName, fileName, manual.type],
        );
      }
    } else {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO documents (
           organization_id, entity_type, entity_id, document_type, document_data
         ) VALUES (
           $1, 'ORDER', 0, 'manual',
           jsonb_build_object(
             'url', $2::text,
             'source', 'product_manuals_promote',
             'platform', 'manual',
             'mimeType', 'application/pdf',
             'filename', COALESCE($3::text, 'manual.pdf'),
             'displayName', $4::text,
             'productManualId', $5::int,
             'manualType', $6::text
           )
         )
         RETURNING id`,
        [orgId, sourceUrl, fileName, displayName, productManualId, manual.type],
      );
      documentId = Number(inserted.rows[0].id);
    }

    await deps.createDocumentEntityLink(
      orgId,
      {
        documentId,
        entityType: 'SKU',
        entityId: skuCatalogId,
        linkRole: 'primary',
      },
      client,
    );

    return {
      documentId,
      productManualId,
      displayName,
      sourceUrl,
      fileName,
      manualType: manual.type,
      skuCatalogId,
    };
  });
}

/** Remove the SKU link for a promoted manual (unpair). Leaves the documents row. */
export async function unlinkManualDocumentFromSku(
  orgId: OrgId,
  productManualId: number,
  skuCatalogId: number,
): Promise<void> {
  await tenantQuery(
    orgId,
    `DELETE FROM document_entity_links l
      USING documents d
      WHERE l.document_id = d.id
        AND l.organization_id = $1
        AND d.organization_id = $1
        AND d.document_type = 'manual'
        AND (d.document_data->>'productManualId') = $2
        AND l.entity_type = 'SKU'
        AND l.entity_id = $3`,
    [orgId, String(productManualId), skuCatalogId],
  );
}

/** Manuals linked to a SKU catalog row via document_entity_links. */
export async function listManualDocumentsForSku(
  orgId: OrgId,
  skuCatalogId: number,
): Promise<ManualDocumentRow[]> {
  const res = await tenantQuery<{
    id: number;
    document_data: Record<string, unknown>;
  }>(
    orgId,
    `SELECT d.id, d.document_data
       FROM documents d
       JOIN document_entity_links l
         ON l.document_id = d.id AND l.organization_id = d.organization_id
      WHERE d.organization_id = $1
        AND d.document_type = 'manual'
        AND l.entity_type = 'SKU'
        AND l.entity_id = $2
      ORDER BY d.updated_at DESC NULLS LAST, d.id DESC`,
    [orgId, skuCatalogId],
  );

  return res.rows.map((r) => {
    const data = r.document_data ?? {};
    const productManualId = Number(data.productManualId);
    return {
      documentId: Number(r.id),
      productManualId: Number.isFinite(productManualId) && productManualId > 0 ? productManualId : null,
      displayName: displayFromData(data, Number(r.id)),
      sourceUrl: data.url ? String(data.url) : null,
      fileName: data.filename ? String(data.filename) : null,
      manualType: data.manualType ? String(data.manualType) : null,
      skuCatalogId,
    };
  });
}

/**
 * Manuals for an order: prefer documents linked to the order's sku_catalog_id.
 * Used by pack-bundle dual-read.
 */
export async function listManualDocumentsForOrder(
  orgId: OrgId,
  orderPkId: number,
): Promise<ManualDocumentRow[]> {
  const orderRes = await tenantQuery<{ sku_catalog_id: number | string | null }>(
    orgId,
    `SELECT sku_catalog_id FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [orderPkId, orgId],
  );
  const catalogId = Number(orderRes.rows[0]?.sku_catalog_id);
  if (!Number.isFinite(catalogId) || catalogId <= 0) return [];
  return listManualDocumentsForSku(orgId, catalogId);
}
