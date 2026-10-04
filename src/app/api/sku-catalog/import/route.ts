/**
 * POST /api/sku-catalog/import — a product list into the catalog (Products ›
 * Import products CSV). Always answers the plan (`src/lib/sku/catalog-import.ts`:
 * `[OLD]` dropped, zeros restored, new / in catalog / title differs);
 * `apply: true` re-plans on the server and adds the new SKUs in one transaction.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { SkuCatalogImportBody } from '@/lib/schemas/sku-catalog-import';
import { applyCatalogImport, planCatalogImportFor } from '@/lib/sku/catalog-import-store';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import pool from '@/lib/db';

export const runtime = 'nodejs';

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(SkuCatalogImportBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    const plan = await planCatalogImportFor(ctx.organizationId, parsed.rows);
    if (!parsed.apply) return NextResponse.json({ plan, applied: null });

    const applied = await applyCatalogImport(ctx.organizationId, plan);
    if (applied.insertedIds.length > 0) {
      await recordAudit(pool, ctx, req, {
        source: 'sku-catalog-import-api',
        action: AUDIT_ACTION.SKU_CATALOG_IMPORT,
        entityType: AUDIT_ENTITY.SKU,
        entityId: applied.insertedIds.length,
        method: 'manual',
        after: { insertedIds: applied.insertedIds, crosswalk: applied.crosswalk, summary: plan.summary },
      });
      await invalidateCacheTags(ctx.organizationId, [CACHE_TAGS.skuCatalog]);
    }
    return NextResponse.json({ plan, applied: { inserted: applied.insertedIds.length, crosswalk: applied.crosswalk } });
  },
  { permission: 'sku_stock.manage' },
);
