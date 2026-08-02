/**
 * POST /api/receiving/lines/[id]/label-previewed
 *
 * Stamp that an operator read this line's printed label face
 * (`receiving_line_testing.label_previewed_at`) — the gate for the Unbox
 * procedure's `label` capture step. `{ confirmed: false }` retracts it.
 *
 * WHY A COLUMN OF ITS OWN. Reading a label leaves no evidence behind, so unlike
 * every photo step there is no carton fact to derive from. The two columns that
 * already exist answer different questions: `receiving_line.label_note` says the
 * face was CUSTOMISED (null on every carton whose default face was right, so
 * gating on it parks the procedure pointer forever), and `label_printed_at` is
 * the COMMIT act the terminal dock owns — gating a capture step on it would
 * invert the phase order. Same shape and same justification as the sibling
 * carton-acknowledgement route `/api/receiving/[id]/contents-confirm`.
 *
 * PERMISSION. `receiving.mark_received`, matching that sibling: anyone who can
 * finish a carton can say they read the face it prints. Minting a new permission
 * nobody's role grants is the `integrations.zendesk` failure — an ADMIN_ONLY gate
 * 403'ing the floor operator the surface was built for.
 *
 * NOT COALESCE. `label_printed_at` keeps its first stamp because a reprint does
 * not re-print a *different* face; this one overwrites, because re-reading after
 * editing the face is a new acknowledgement of new text.
 *
 * AUDIT. The stamp is clearable, so a reopen leaves no trace in the column;
 * `audit_logs` is the only place the original claim survives, and confirm /
 * reopen are two distinct actions so a rollup cannot count a retraction as a
 * confirmation.
 */

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

    // Narrow upsert, mirroring the sibling label-printed route: the testing row
    // may not exist yet (its other columns all carry DB defaults), so INSERT …
    // ON CONFLICT. The FOR UPDATE spine read preserves the 404 and locks the
    // line.
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
