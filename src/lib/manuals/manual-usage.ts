import 'server-only';

import { escapeLike } from '@/lib/sql-like';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { PrepackManual } from '@/lib/prepack/types';

/** The columns {@link MANUAL_USAGE_SELECT} returns. */
export interface ManualUsageRow {
  id: string | number;
  display_name: string | null;
  product_title: string | null;
  type: string | null;
  file_name: string | null;
  updated_at: Date | string | null;
  status: string | null;
  sku: string | null;
  sku_catalog_id: number | null;
  catalog_sku: string | null;
  catalog_title: string | null;
  item_number: string | null;
  order_id: number | null;
  order_label: string | null;
}

/** A manual and where it is used: its catalog SKU and its order (exact, org-scoped joins). Alias `pm`. */
export const MANUAL_USAGE_SELECT = `SELECT pm.id, pm.display_name, pm.product_title, pm.type, pm.file_name, pm.updated_at,
       pm.status, pm.sku, pm.sku_catalog_id, sc.sku AS catalog_sku, sc.product_title AS catalog_title,
       pm.item_number, pm.order_id, o.order_id::text AS order_label
  FROM product_manuals pm
  LEFT JOIN sku_catalog sc ON sc.id = pm.sku_catalog_id AND sc.organization_id = pm.organization_id
  LEFT JOIN orders o ON o.id = pm.order_id AND o.organization_id = pm.organization_id`;

export function toManualWithUsage(row: ManualUsageRow): PrepackManual {
  const id = Number(row.id);
  return {
    id,
    title: row.display_name?.trim() || row.product_title?.trim() || row.file_name?.trim() || `Manual ${id}`,
    type: row.type?.trim() || null,
    fileName: row.file_name?.trim() || null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    usage: {
      sku: row.catalog_sku?.trim() || row.sku?.trim() || null,
      skuCatalogId: row.sku_catalog_id != null ? Number(row.sku_catalog_id) : null,
      productTitle: row.catalog_title?.trim() || row.product_title?.trim() || null,
      itemNumber: row.item_number?.trim() || null,
      orderId: row.order_id != null ? Number(row.order_id) : null,
      orderLabel: row.order_label?.trim() || null,
      status: row.status === 'assigned' || row.status === 'archived' ? row.status : 'unassigned',
    },
  };
}

/**
 * Library search with usage, org-scoped. Every word must appear somewhere in
 * the manual's name, product title, file, folder, SKU, item number or its
 * linked catalog row ("bose wave" finds "Bose QR Code Manual Wave Acoustic
 * II"). Exact item number / SKU hits first, then newest. Empty `q` lists the
 * newest manuals.
 */
export async function searchManualsWithUsage(orgId: OrgId, q: string, limit = 20): Promise<PrepackManual[]> {
  const query = q.trim();
  const terms = Array.from(new Set(query.toLowerCase().split(/\s+/).filter(Boolean))).slice(0, 8);
  const res = await tenantQuery<ManualUsageRow>(
    orgId,
    `${MANUAL_USAGE_SELECT}
      WHERE pm.organization_id = $1
        AND pm.is_active = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM UNNEST($2::text[]) AS term
           WHERE LOWER(CONCAT_WS(' ',
                   pm.item_number, pm.display_name, pm.product_title, pm.sku, pm.file_name,
                   pm.relative_path, sc.sku, sc.product_title
                 )) NOT LIKE '%' || term || '%' ESCAPE '\\'
        )
      ORDER BY CASE
                 WHEN $3 <> '' AND (UPPER(BTRIM(COALESCE(pm.item_number, ''))) = UPPER($3)
                                   OR UPPER(BTRIM(COALESCE(pm.sku, sc.sku, ''))) = UPPER($3)) THEN 0
                 ELSE 1
               END,
               pm.updated_at DESC NULLS LAST, pm.id DESC
      LIMIT $4`,
    [orgId, terms.map((term) => escapeLike(term)), query, Math.min(Math.max(limit, 1), 50)],
  );
  return res.rows.map(toManualWithUsage);
}
