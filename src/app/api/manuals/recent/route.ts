import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import { normalizeIdentifier } from '@/lib/manuals/identifier-key';
import { resolveSkuCatalogId } from '@/lib/neon/sku-catalog-queries';
import { getCurrentUser } from '@/lib/auth/current-user';

function buildDocUrls(googleFileId: string) {
  return {
    previewUrl: `https://docs.google.com/document/d/${googleFileId}/preview`,
    viewUrl: `https://docs.google.com/document/d/${googleFileId}`,
    downloadUrl: `https://docs.google.com/document/d/${googleFileId}/export?format=pdf`,
  };
}

export async function GET(req: NextRequest) {
  try {
    // This route is intentionally ungated (gate:
    const user = await getCurrentUser();
    const orgId = user?.organizationId ?? null;
    const { searchParams } = new URL(req.url);
    const itemNumber = String(searchParams.get('itemNumber') || '');
    const sku = String(searchParams.get('sku') || '');
    const limitParam = Number(searchParams.get('limit') || 3);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 10) : 3;

    const normalizedItemNumber = normalizeIdentifier(itemNumber);

    if (!normalizedItemNumber && !sku.trim()) {
      return NextResponse.json({ success: true, manuals: [] });
    }

    // ── Hub-first:
    const skuCatalogId = await resolveSkuCatalogId(sku || null, itemNumber || null, null, orgId ?? undefined);

    let rows: any[] = [];

    if (skuCatalogId) {
      // product_manuals has no organization_id column (child-scoped via
      // sku_catalog). When we have an org, scope this read through the parent
      // catalog row's org + GUC-wrap; when anonymous, keep prior behavior.
      const hubResult = orgId
        ? await tenantQuery(
            orgId,
            `SELECT
               id,
               item_number,
               product_title,
               display_name,
               google_file_id,
               type,
               is_active,
               updated_at
             FROM product_manuals
             WHERE sku_catalog_id = $1
               AND EXISTS (
                 SELECT 1 FROM sku_catalog sc
                 WHERE sc.id = product_manuals.sku_catalog_id
                   AND sc.organization_id = $3
               )
             ORDER BY is_active DESC, updated_at DESC
             LIMIT $2`,
            [skuCatalogId, limit, orgId]
          )
        : await pool.query(
            `SELECT
               id,
               item_number,
               product_title,
               display_name,
               google_file_id,
               type,
               is_active,
               updated_at
             FROM product_manuals
             WHERE sku_catalog_id = $1
             ORDER BY is_active DESC, updated_at DESC
             LIMIT $2`,
            [skuCatalogId, limit]
          );
      rows = hubResult.rows;
    }

    // ── Fallback: legacy item_number match for un-migrated records ──────────
    if (rows.length === 0 && normalizedItemNumber) {
      // Legacy item_number path:
      const fallbackResult = orgId
        ? await tenantQuery(
            orgId,
            `SELECT
               pm.id,
               pm.item_number,
               pm.product_title,
               pm.display_name,
               pm.google_file_id,
               pm.type,
               pm.is_active,
               pm.updated_at
             FROM product_manuals pm
             WHERE pm.sku_catalog_id IS NULL
               AND regexp_replace(UPPER(TRIM(COALESCE(pm.item_number, ''))), '[^A-Z0-9]', '', 'g') = $1
               AND NOT EXISTS (
                 SELECT 1
                 FROM sku_platform_ids spi
                 JOIN sku_catalog sc ON sc.id = spi.sku_catalog_id
                 WHERE regexp_replace(UPPER(TRIM(COALESCE(spi.platform_item_id, ''))), '[^A-Z0-9]', '', 'g') = $1
                   AND sc.organization_id <> $3
               )
             ORDER BY pm.is_active DESC, pm.updated_at DESC
             LIMIT $2`,
            [normalizedItemNumber, limit, orgId]
          )
        // Anonymous/session-less callers (route is intentionally gate:
        : await pool.query(
            `SELECT
               id,
               item_number,
               product_title,
               display_name,
               google_file_id,
               type,
               is_active,
               updated_at
             FROM product_manuals
             WHERE regexp_replace(UPPER(TRIM(COALESCE(item_number, ''))), '[^A-Z0-9]', '', 'g') = $1
             ORDER BY is_active DESC, updated_at DESC
             LIMIT $2`,
            [normalizedItemNumber, limit]
          );
      rows = fallbackResult.rows;
    }

    const manuals = rows.map((row) => ({
      id: row.id as number,
      itemNumber: (row.item_number as string) || null,
      productTitle: (row.product_title as string) || null,
      displayName: (row.display_name as string) || null,
      googleFileId: row.google_file_id as string,
      type: (row.type as string) || null,
      isActive: !!row.is_active,
      updatedAt: row.updated_at as string,
      ...buildDocUrls(row.google_file_id as string),
    }));

    return NextResponse.json({ success: true, manuals });
  } catch (error: any) {
    console.error('Error fetching recent manuals:', error);
    return NextResponse.json(
      { success: false, manuals: [], error: 'Failed to fetch recent manuals', details: error?.message },
      { status: 500 }
    );
  }
}
