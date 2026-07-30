/**
 * POST   /api/receiving/lines/[id]/loss   — write the line's goods off as lost
 * DELETE /api/receiving/lines/[id]/loss   — the carton turned up; reopen it
 *
 * Phase 3 of docs/todo/ebay-delivered-not-unboxed-PLAN.md. The exit door for the
 * "Delivered · not unboxed" lane: before this, a carrier-delivered carton whose
 * goods never materialized could only leave by aging out of the query window, so
 * the exception disappeared with no record of what happened to the goods.
 *
 * Writes an OPEN `receiving_exceptions` row and does NOT touch `workflow_status` —
 * the rationale (PROBLEM is orthogonal to the lifecycle; `FAILED` would stamp
 * `received_at` on goods that never arrived) lives in `lib/receiving/loss-writeoff.ts`.
 *
 * DELETE is a real reopen, not a delete: it resolves the open loss exceptions, so
 * the write-off stays in history and the line returns to the lane.
 *
 * Permission: `receiving.mark_received`. Deliberately reuses the existing receive
 * permission rather than minting `receiving.write_off` — a new permission id is not
 * granted by `scripts/seed-roles.mjs` until that script is updated, so a fresh id
 * would 403 every operator (the trap `integrations.zendesk` hit). An operator
 * trusted to declare a carton received is trusted to declare it lost; splitting
 * them is a follow-up that must touch seed-roles in the same change.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import {
  lossWriteoffInvalidBody,
  normalizeLossNote,
  parseLossCode,
  recordLossWriteoff,
  reopenLossWriteoff,
} from '@/lib/receiving/loss-writeoff';

/** `/api/receiving/lines/<id>/loss` → the numeric line id, or null. */
function lineIdFromPath(request: NextRequest): number | null {
  const segments = request.nextUrl.pathname.split('/');
  const id = Number(segments[segments.indexOf('lines') + 1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

interface LineSpine {
  id: number;
  receiving_id: number | null;
  delivered_at: string | null;
}

/**
 * Locked spine read — preserves the 404 and hands back the carton id (for cache
 * invalidation) plus the carrier delivery instant (for the server-assembled reason).
 */
async function lockLine(orgId: OrgId, lineId: number): Promise<LineSpine | null> {
  return withTenantTransaction(orgId, async (client) => {
    const res = await client.query<LineSpine>(
      `SELECT rl.id,
              rl.receiving_id,
              stn.delivered_at::text AS delivered_at
         FROM receiving_line rl
         LEFT JOIN receiving_carton r ON r.id = rl.receiving_id
         LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
        WHERE rl.id = $1 AND rl.organization_id = $2
        FOR UPDATE OF rl`,
      [lineId, orgId],
    );
    return res.rows[0] ?? null;
  });
}

function afterWrite(orgId: OrgId, receivingId: number | null, source: string) {
  after(async () => {
    try {
      await invalidateReceivingViews(orgId);
      if (receivingId != null) {
        await publishReceivingLogChanged({
          organizationId: orgId,
          action: 'update',
          rowId: String(receivingId),
          source,
        });
      }
    } catch (err) {
      console.warn(`${source}: cache/realtime update failed`, err);
    }
  });
}

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    const lineId = lineIdFromPath(request);
    if (lineId == null) {
      return NextResponse.json({ success: false, error: 'invalid line id' }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 });
    }

    // A write-off with no stated kind of loss is never accepted — absent and
    // invalid both 400, and the body echoes the allowed vocabulary.
    const parsed = parseLossCode(body.code);
    if (parsed.state !== 'valid') {
      return NextResponse.json(lossWriteoffInvalidBody(), { status: 400 });
    }
    const note = normalizeLossNote(body.note);

    const line = await lockLine(ctx.organizationId, lineId);
    if (!line) {
      return NextResponse.json(
        { success: false, error: `line ${lineId} not found` },
        { status: 404 },
      );
    }

    const { exceptionId } = await recordLossWriteoff(ctx.organizationId, {
      code: parsed.code,
      receivingLineId: line.id,
      receivingId: line.receiving_id,
      deliveredAt: line.delivered_at,
      note,
      staffId: ctx.staffId ?? null,
    });

    await recordAudit(pool, ctx, request, {
      source: 'receiving-loss-writeoff',
      action: AUDIT_ACTION.RECEIVING_LOSS_WRITE_OFF,
      entityType: AUDIT_ENTITY.RECEIVING_LINE,
      entityId: line.id,
      // AUDIT_REASON_REQUIRED action — the code IS the record.
      reasonCode: parsed.code,
      method: 'manual',
      extra: {
        receiving_id: line.receiving_id,
        receiving_exception_id: exceptionId,
        delivered_at: line.delivered_at,
        has_note: note != null,
      },
    });

    afterWrite(ctx.organizationId, line.receiving_id, 'receiving.lines.loss');

    return NextResponse.json({
      success: true,
      line_id: line.id,
      code: parsed.code,
      receiving_exception_id: exceptionId,
    });
  },
  { permission: 'receiving.mark_received' },
);

export const DELETE = withAuth(
  async (request: NextRequest, ctx) => {
    const lineId = lineIdFromPath(request);
    if (lineId == null) {
      return NextResponse.json({ success: false, error: 'invalid line id' }, { status: 400 });
    }

    const line = await lockLine(ctx.organizationId, lineId);
    if (!line) {
      return NextResponse.json(
        { success: false, error: `line ${lineId} not found` },
        { status: 404 },
      );
    }

    const { resolved } = await reopenLossWriteoff(
      ctx.organizationId,
      line.id,
      ctx.staffId ?? null,
    );
    // Nothing was written off — 404 rather than a silent 200, so a mis-aimed
    // reopen is visible instead of looking like it did something.
    if (resolved === 0) {
      return NextResponse.json(
        { success: false, error: `line ${lineId} has no open loss write-off` },
        { status: 404 },
      );
    }

    await recordAudit(pool, ctx, request, {
      source: 'receiving-loss-writeoff',
      action: AUDIT_ACTION.RECEIVING_LOSS_REOPEN,
      entityType: AUDIT_ENTITY.RECEIVING_LINE,
      entityId: line.id,
      method: 'manual',
      extra: { receiving_id: line.receiving_id, resolved_exceptions: resolved },
    });

    afterWrite(ctx.organizationId, line.receiving_id, 'receiving.lines.loss.reopen');

    return NextResponse.json({ success: true, line_id: line.id, resolved });
  },
  { permission: 'receiving.mark_received' },
);
