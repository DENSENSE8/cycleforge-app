import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { recordDisposition, type DispositionCode } from '@/lib/rma/authorizations';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

const VALID_CODES: ReadonlySet<DispositionCode> = new Set([
  'ACCEPT',
  'HOLD',
  'RTV',
  'REWORK',
  'SCRAP',
]);

/** POST /api/rma/disposition */
export const POST = withAuth(async (request, ctx) => {
  const actorStaffId: number | null =
    typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;
  if (actorStaffId == null) {
    return NextResponse.json({ ok: false, error: 'authenticated staff required' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));

  const serialUnitIdRaw = body?.serial_unit_id;
  const serialUnitId =
    typeof serialUnitIdRaw === 'number' && Number.isFinite(serialUnitIdRaw) && serialUnitIdRaw > 0
      ? serialUnitIdRaw
      : null;
  if (serialUnitId == null) {
    return NextResponse.json({ ok: false, error: 'serial_unit_id is required' }, { status: 400 });
  }

  const rmaIdRaw = body?.rma_id;
  const rmaId =
    typeof rmaIdRaw === 'number' && Number.isFinite(rmaIdRaw) && rmaIdRaw > 0 ? rmaIdRaw : null;

  const dispositionCode = String(body?.disposition_code || '') as DispositionCode;
  if (!VALID_CODES.has(dispositionCode)) {
    return NextResponse.json(
      { ok: false, error: `invalid disposition_code: ${dispositionCode}` },
      { status: 400 },
    );
  }
  const notes = typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

  try {
    const result = await recordDisposition({
      rmaId,
      serialUnitId,
      dispositionCode,
      decidedByStaffId: actorStaffId,
      notes,
      organizationId: ctx.organizationId ?? null,
    });
    if (!result.ok) return NextResponse.json(result, { status: result.status });

    // entityId is always the disposition row's own id — never rmaId.
    await recordAudit(pool, ctx, request, {
      source: 'rma-api',
      action: AUDIT_ACTION.RMA_DISPOSITION,
      entityType: AUDIT_ENTITY.RMA,
      entityId: result.dispositionId,
      after: {
        serial_unit_id: serialUnitId,
        rma_id: rmaId,
        disposition_code: dispositionCode,
        restocked: result.restocked,
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'disposition failed';
    console.error('[POST /api/rma/disposition] error:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, { permission: 'rma.manage' });
