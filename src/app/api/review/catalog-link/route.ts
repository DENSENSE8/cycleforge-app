import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { CatalogLinkActionBody } from '@/lib/schemas/catalog-link';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';
import {
  ignoreCatalogLinkChore,
  linkCatalogLinkChore,
  listOpenCatalogLinkChores,
} from '@/lib/inventory/order-catalog-link-chores';

/**
 * GET /api/review/catalog-link — open Review · Catalog link chores
 * (explicitly enqueued on sheet import catalog miss; not historical orphans).
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const { searchParams } = new URL(req.url);
      const q = searchParams.get('q') || '';
      const limit = Math.max(1, Math.min(500, Number(searchParams.get('limit') || 100)));
      const offset = Math.max(0, Number(searchParams.get('offset') || 0));

      const { rows, total } = await listOpenCatalogLinkChores(ctx.organizationId, {
        q,
        limit,
        offset,
      });

      return NextResponse.json({ success: true, items: rows, total });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to list catalog-link chores';
      console.error('[review/catalog-link] GET', error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { permission: 'packing.review' },
);

/**
 * POST /api/review/catalog-link — link a chore to a sku_catalog SoT (backfills
 * all matching orders) or ignore it.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const raw = await req.json().catch(() => ({}));
      const parsed = parseBody(CatalogLinkActionBody, raw);
      if (parsed instanceof NextResponse) return parsed;

      if (parsed.action === 'ignore') {
        const result = await ignoreCatalogLinkChore(ctx.organizationId, parsed.choreId);
        if (!result.ok) {
          return NextResponse.json(
            { success: false, error: result.error },
            { status: result.status },
          );
        }
        await recordAudit(pool, ctx, req, {
          source: 'review-catalog-link',
          action: AUDIT_ACTION.SKU_CATALOG_LINK_IGNORE,
          entityType: AUDIT_ENTITY.SKU,
          entityId: parsed.choreId,
          after: { choreId: parsed.choreId, status: 'ignored' },
        });
        return NextResponse.json({ success: true, ignored: true });
      }

      const result = await linkCatalogLinkChore(ctx.organizationId, {
        choreId: parsed.choreId,
        skuCatalogId: parsed.skuCatalogId,
        staffId: ctx.staffId ?? null,
      });
      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: result.status },
        );
      }

      await recordAudit(pool, ctx, req, {
        source: 'review-catalog-link',
        action: AUDIT_ACTION.SKU_CATALOG_LINK_REVIEW,
        entityType: AUDIT_ENTITY.SKU,
        entityId: parsed.skuCatalogId,
        after: {
          choreId: parsed.choreId,
          skuCatalogId: parsed.skuCatalogId,
          ordersBackfilled: result.ordersBackfilled,
          manualsBackfilled: result.manualsBackfilled,
        },
      });

      return NextResponse.json({
        success: true,
        linked: true,
        ordersBackfilled: result.ordersBackfilled,
        manualsBackfilled: result.manualsBackfilled,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update catalog-link chore';
      console.error('[review/catalog-link] POST', error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { permission: 'packing.review' },
);
