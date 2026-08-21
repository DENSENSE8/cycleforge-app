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

/**
 * POST /api/stations/handoff
 *
 * The one place a scan may change status.
 *
 * An operator scans a unit, then scans an action sticker (`CMD-PASS`,
 * `CMD-PASS-GO-READY`, …). This route resolves the unit, applies the sticker's
 * verdict through `recordTestVerdict` — the QC verdict SoT, which also owns the
 * `tech_serial_numbers` row, the `testing_results` feed, the parent line rollup
 * and the workflow tap — writes the compliance audit row, and hands back the
 * command's navigation target.
 *
 * It is a sibling of `POST /api/serial-units/[id]/test`, not a replacement:
 * that route takes an id from the URL and a verdict from the body (a pointer
 * gesture); this one takes a scanned KEY and a sticker CODE (a scanner
 * gesture), and answers with where to go next. Both delegate the domain work to
 * the same helper, so a verdict recorded by sticker and one recorded by button
 * are the same event.
 *
 * **Navigation is the CLIENT's move, and only on a 2xx.** This route returns
 * `goTo` as data; it never implies the jump happened. A failed write that still
 * moved the operator would leave the bench believing work landed that did not.
 */

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
  // Resolve a tenant alias to its built-in target BEFORE parsing. The client
  // already did this from its hydrated snapshot, and the server does it again
  // from the DB — a code arriving here is a wire value, and trusting the
  // client's resolution would let a caller name any command it liked.
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
  // The client check exists to nack instantly at the bar; this one is the gate.
  // A sticker is a wire value like any other — that it came from a printed
  // sheet says nothing about who scanned it.
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
      // A verdict recorded by sticker and one recorded by button are the same
      // event, but they are not the same GESTURE, and only the audit row can
      // say which one an operator actually performed.
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
