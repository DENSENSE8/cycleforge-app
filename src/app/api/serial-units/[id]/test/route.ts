import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  recordTestVerdict,
  GuardRejectedError,
  TEST_VERDICTS,
  type TestVerdict,
} from '@/lib/tech/recordTestVerdict';

/** POST /api/serial-units/[id]/test */

// Formal audit-log verb per verdict.
const VERDICT_TO_AUDIT_ACTION: Record<TestVerdict, string> = {
  PASS: AUDIT_ACTION.TECH_QC_PASS,
  TEST_AGAIN: AUDIT_ACTION.TECH_QC_RETEST,
  TESTING_FAILED: AUDIT_ACTION.TECH_QC_FAIL,
};

export const POST = withAuth(async (request, ctx) => {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  // .../api/serial-units/[id]/test → id is segments[-2]
  const idStr = segments[segments.length - 2];
  const serialUnitId = Number(idStr);
  if (!Number.isFinite(serialUnitId) || serialUnitId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid serial_unit id' }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* empty body handled below */
  }

  const verdictRaw = String(body.verdict ?? '').trim().toUpperCase();
  if (!(TEST_VERDICTS as readonly string[]).includes(verdictRaw)) {
    return NextResponse.json(
      { ok: false, error: `verdict must be one of: ${TEST_VERDICTS.join(', ')}` },
      { status: 400 },
    );
  }
  const verdict = verdictRaw as TestVerdict;

  // Verdict-gated permission split.
  if (verdict === 'TESTING_FAILED' && !ctx.permissions.has('tech.qc_fail')) {
    return NextResponse.json(
      { ok: false, error: 'You do not have the tech.qc_fail permission' },
      { status: 403 },
    );
  }

  // Notes cap matches the SQL TEXT column's practical limit. Anything
  // longer is almost certainly an accidental paste, not legitimate input.
  const notesRaw = typeof body.notes === 'string' ? body.notes.trim() : '';
  const notes = notesRaw ? notesRaw.slice(0, 2000) : null;
  const clientEventId =
    typeof body.client_event_id === 'string' && body.client_event_id.trim()
      ? body.client_event_id.trim()
      : null;
  const actorStaffId: number | null =
    typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null;

  try {
    const result = await recordTestVerdict({
      serialUnitId,
      verdict,
      notes,
      clientEventId,
      actorStaffId,
      organizationId: ctx.organizationId,
    });
    if (!result) {
      return NextResponse.json({ ok: false, error: 'unit not found' }, { status: 404 });
    }

    // Formal audit-log row. recordAudit pulls actor/role/ip/request-id from
    // the auth context + headers and never throws (failures are logged and
    // dropped), so it can't break the verdict.
    await recordAudit(pool, ctx, request, {
      source: 'tech.qc-verdict',
      action: VERDICT_TO_AUDIT_ACTION[verdict],
      entityType: AUDIT_ENTITY.SERIAL_UNIT,
      entityId: result.unit.id,
      method: 'manual',
      before: { status: result.prevStatus },
      after: { status: result.nextStatus },
      note: notes,
      extra: {
        verdict,
        receiving_line_id: result.unit.origin_receiving_line_id,
        serial_number: result.unit.serial_number,
        sku: result.unit.sku,
        inventory_event_id: result.eventId,
      },
    });

    return NextResponse.json({
      ok: true,
      unit: result.unit,
      line: result.line,
      event_id: result.eventId,
    });
  } catch (err) {
    // The unified-engine chokepoint refused this transition (held/shipped/illegal
    // source state) — a client/state error, not a server fault → 409.
    if (err instanceof GuardRejectedError) {
      return NextResponse.json({ ok: false, error: err.message, from: err.from }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : 'test verdict failed';
    console.error('[POST /api/serial-units/[id]/test] error:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, { permission: 'tech.qc_pass' });
