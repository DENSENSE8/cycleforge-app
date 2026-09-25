import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { StoreLinkUpsertBody } from '@/lib/schemas/catalog';
import { listStoreLinks, StoreLinkTargetError, upsertStoreLink } from '@/lib/catalog/integration-store-links';
import { recordAudit } from '@/lib/audit-logs';
import pool from '@/lib/db';

/**
 * GET /api/catalog/store-links — where each aggregator store sells (platform +
 * optional storefront account). The order platform picker reads it to list an
 * account only when a store is linked to it.
 */
export const GET = withAuth(
  async (_req: NextRequest, ctx) => {
    try {
      const links = await listStoreLinks(ctx.organizationId);
      return NextResponse.json({ success: true, links });
    } catch (err) {
      return errorResponse(err, 'GET /api/catalog/store-links');
    }
  },
  { permission: 'receiving.view' },
);

/**
 * PUT /api/catalog/store-links — link one store to an EXISTING platform (and
 * optionally one of its accounts). Upsert: re-sending the same link is a no-op.
 */
export const PUT = withAuth(
  async (req: NextRequest, ctx) => {
    try {
      const raw = await req.json().catch(() => ({}));
      const parsed = parseBody(StoreLinkUpsertBody, raw);
      if (parsed instanceof NextResponse) return parsed;

      const before =
        (await listStoreLinks(ctx.organizationId, parsed.provider)).find(
          (l) => l.external_store_id === parsed.externalStoreId,
        ) ?? null;
      const link = await upsertStoreLink(ctx.organizationId, parsed);

      await recordAudit(pool, ctx, req, {
        source: 'catalog-api',
        action: 'catalog.store_link.set',
        entityType: 'catalog_store_link',
        entityId: link.id,
        before: before ? { ...before } : null,
        after: { ...link },
      });
      return NextResponse.json({ success: true, link });
    } catch (err) {
      if (err instanceof StoreLinkTargetError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 404 });
      }
      return errorResponse(err, 'PUT /api/catalog/store-links');
    }
  },
  { permission: 'admin.manage_features' },
);
