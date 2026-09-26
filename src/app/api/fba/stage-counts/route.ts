import { NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrSet } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS, CACHE_TTL } from '@/lib/cache/tags';

/** GET /api/fba/stage-counts */
export const GET = withAuth(async (_request, ctx) => {
  // 120s-polled sidebar accordion badges → short-TTL org-scoped cache. Every FBA
  // write busts fba-stage-counts (org-scoped), so counts stay fresh between polls.
  const counts = await getOrSet<Record<string, number>>(
    CACHE_NS.fbaStageCounts,
    ctx.organizationId,
    'counts',
    CACHE_TTL.stationRead,
    [CACHE_TAGS.fbaStageCounts],
    async () => {
      const result = await tenantQuery(
        ctx.organizationId,
        `
          SELECT status, COUNT(*) AS cnt
          FROM fba_shipment_items
          WHERE status IN ('PLANNED', 'TESTED', 'PACKED', 'OUT_OF_STOCK', 'LABEL_ASSIGNED')
            AND organization_id = $1
          GROUP BY status
        `,
        [ctx.organizationId]
      );

      const c: Record<string, number> = {
        PLANNED:        0,
        TESTED:         0,
        PACKED:         0,
        OUT_OF_STOCK:   0,
        LABEL_ASSIGNED: 0,
      };

      for (const row of result.rows) {
        c[row.status] = Number(row.cnt);
      }
      return c;
    },
  );

  return NextResponse.json({ success: true, counts });
}, { permission: 'fba.view', feature: 'fba' });
