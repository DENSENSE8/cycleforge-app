import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import pool from '@/lib/db';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { resolveUnitByScanKey } from '@/lib/inventory/resolve-unit-key';
import { parseActionCommand } from '@/lib/stations/action-command-codes';
import { resolveAliasTargetForOrg } from '@/lib/stations/resolve-alias-server';
import {
  recordTestVerdict,
  GuardRejectedError,
  type TestVerdict,
} from '@/lib/tech/recordTestVerdict';
import type { OrgId } from '@/lib/tenancy/constants';

/** POST /api/stations/handoff */

const VERDICT_TO_AUDIT_ACTION: Record<TestVerdict, string> = {
  PASS: AUDIT_ACTION.TECH_QC_PASS,
  TEST_AGAIN: AUDIT_ACTION.TECH_QC_RETEST,
  TESTING_FAILED: AUDIT_ACTION.TECH_QC_FAIL,
};

export const POST = withAuth(async (request, ctx) => {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* handled by the validation below */
  }

  const code = String(body.code ?? '').trim();
  // Resolve a tenant alias to its built-in target BEFORE parsing.
  const canonical =
    (await resolveAliasTargetForOrg(ctx.organizationId as OrgId, code)) ?? code;
  const def = parseActionCommand(canonical);
  if (!def) {
    return NextResponse.json(
      { ok: false, error: `unknown action command: ${code || '(empty)'}` },
      { status: 400 },
    );
  }

  // Permission is checked on the SERVER even though the client checked it too.
  if (!ctx.permissions.has(def.requires)) {
    return NextResponse.json(
      { ok: false, error: `You do not have the ${def.requires} permission` },
      { status: 403 },
    );
  }

  const unitKey = String(body.unitKey ?? '').trim();
  if (!unitKey) {
    return NextResponse.json(
      { ok: false, error: 'no unit in hand — scan a unit before the command' },
      { status: 400 },
    );
  }

  const clientEventId =
    typeof body.clientEventId === 'string' && body.clientEventId.trim()
      ? body.clientEventId.trim()
      : null;

  try {
    const unit = await resolveUnitByScanKey(ctx.organizationId as OrgId, unitKey);
    if (!unit) {
      return NextResponse.json(
        { ok: false, error: `no unit found for ${unitKey}` },
        { status: 404 },
      );
    }

    const result = await recordTestVerdict({
      serialUnitId: unit.id,
      verdict: def.verdict,
      notes: null,
      clientEventId,
      actorStaffId:
        typeof ctx.staffId === 'number' && ctx.staffId > 0 ? ctx.staffId : null,
      organizationId: ctx.organizationId,
    });
    if (!result) {
      return NextResponse.json({ ok: false, error: 'unit not found' }, { status: 404 });
    }

    await recordAudit(pool, ctx, request, {
      source: 'station.handoff',
      action: VERDICT_TO_AUDIT_ACTION[def.verdict],
      entityType: AUDIT_ENTITY.SERIAL_UNIT,
      entityId: result.unit.id,
      // `scan`, not `manual` — the distinction is the whole point of this route.
      method: 'scan',
      scanRef: code.toUpperCase(),
      before: { status: result.prevStatus },
      after: { status: result.nextStatus },
      extra: {
        command: def.code,
        verdict: def.verdict,
        then_go: def.thenGo,
        receiving_line_id: result.unit.origin_receiving_line_id,
        serial_number: result.unit.serial_number,
        sku: result.unit.sku,
        inventory_event_id: result.eventId,
      },
    });

    return NextResponse.json({
      ok: true,
      command: def.code,
      unit: { id: result.unit.id, serialNumber: result.unit.serial_number },
      from: result.prevStatus,
      to: result.nextStatus,
      /** Nav command code the client should run next, or null to stay put. */
      goTo: def.thenGo,
      eventId: result.eventId,
    });
  } catch (err) {
    // The unified-engine chokepoint refused this transition (held / shipped /
    // illegal source state). A state error, not a server fault — and the client
    // must NOT navigate on it.
    if (err instanceof GuardRejectedError) {
      return NextResponse.json(
        { ok: false, error: err.message, from: err.from },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : 'handoff failed';
    console.error('[POST /api/stations/handoff] error:', err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}, { permission: 'tech.qc_pass' });
