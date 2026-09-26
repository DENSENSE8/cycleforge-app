/** POST /api/receiving/lines/[id]/label-previewed */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    const segments = request.nextUrl.pathname.split('/');
    const lineId = Number(segments[segments.indexOf('lines') + 1]);
    if (!Number.isFinite(lineId) || lineId <= 0) {
      return NextResponse.json({ success: false, error: 'invalid line id' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { confirmed?: unknown };
    if (body.confirmed !== undefined && typeof body.confirmed !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'confirmed must be a boolean' },
        { status: 400 },
      );
    }
    const confirmed = body.confirmed !== false;
    const staffId = Number(ctx.staffId) || null;

    // Narrow upsert, mirroring the sibling label-printed route:
    const updated = await withTenantTransaction(ctx.organizationId, async (client) => {
      const lineRes = await client.query<{ id: number; receiving_id: number | null }>(
        `SELECT id, receiving_id FROM receiving_line
          WHERE id = $1 AND organization_id = $2
          FOR UPDATE`,
        [lineId, ctx.organizationId],
      );
      const line = lineRes.rows[0];
      if (!line) return null;

      const upsert = await client.query<{ label_previewed_at: string | null }>(
        `INSERT INTO receiving_line_testing (
            receiving_line_id, organization_id, label_previewed_at, label_previewed_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (receiving_line_id) DO UPDATE SET
           label_previewed_at = EXCLUDED.label_previewed_at,
           label_previewed_by = EXCLUDED.label_previewed_by,
           updated_at         = now()
         RETURNING label_previewed_at::text AS label_previewed_at`,
        [
          lineId,
          ctx.organizationId,
          confirmed ? new Date().toISOString() : null,
          confirmed ? staffId : null,
        ],
      );
      return {
        id: line.id,
        receiving_id: line.receiving_id,
        label_previewed_at: upsert.rows[0].label_previewed_at,
      };
    });
    if (!updated) {
      return NextResponse.json(
        { success: false, error: `line ${lineId} not found` },
        { status: 404 },
      );
    }

    await recordAudit(pool, ctx, request, {
      source: 'receiving.lines.label-previewed',
      action: confirmed
        ? AUDIT_ACTION.RECEIVING_LABEL_PREVIEWED
        : AUDIT_ACTION.RECEIVING_LABEL_REOPENED,
      entityType: AUDIT_ENTITY.RECEIVING_LINE,
      entityId: lineId,
      after: { label_previewed: confirmed },
      method: 'manual',
    });

    after(async () => {
      try {
        await invalidateReceivingViews(ctx.organizationId);
        if (updated.receiving_id != null) {
          await publishReceivingLogChanged({
            organizationId: ctx.organizationId,
            action: 'update',
            rowId: String(updated.receiving_id),
            source: 'receiving.lines.label-previewed',
          });
        }
      } catch (err) {
        console.warn('lines/label-previewed: cache/realtime update failed', err);
      }
    });

    return NextResponse.json({ success: true, line: updated });
  },
  { permission: 'receiving.mark_received' },
);
