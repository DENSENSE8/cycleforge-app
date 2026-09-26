/** POST /api/studio/nodes/[id]/station/publish — flip a node-bound draft station live (Operations Studio Phase D / ST5). */

import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { parseBody } from '@/lib/schemas/parse';
import { NodeStationPublishBody } from '@/lib/schemas/stations';
import { publishNodeStation } from '@/lib/studio/node-station';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';

export const dynamic = 'force-dynamic';

export const POST = withAuth(
  async (request, ctx) => {
    const raw = await request.json().catch(() => ({}));
    const parsed = parseBody(NodeStationPublishBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    try {
      const result = await withTenantTransaction(ctx.organizationId, (client) =>
        publishNodeStation({
          client,
          orgId: ctx.organizationId,
          id: parsed.id,
          staffId: ctx.staffId,
        }),
      );

      if (result.status === 200 && 'audit' in result) {
        await recordAudit(pool, ctx, request, {
          source: 'studio-node-station',
          action: AUDIT_ACTION.STATION_PUBLISH,
          entityType: AUDIT_ENTITY.STATION_DEFINITION,
          entityId: parsed.id,
          after: result.audit,
        });
      }
      return NextResponse.json(result.body, { status: result.status });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'studio station publish failed';
      console.error('[POST /api/studio/nodes/[id]/station/publish] error:', err);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  },
  { permission: 'studio.manage', feature: 'studio' },
);
