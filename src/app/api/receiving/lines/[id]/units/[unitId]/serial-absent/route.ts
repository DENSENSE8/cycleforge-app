/**
 * POST /api/receiving/lines/[id]/units/[unitId]/serial-absent
 *
 * Per-unit no-serial waiver for a materialised `receiving_line_unit` row.
 * Mirrors the line-level sibling (`…/lines/[id]/serial-absent`) — toggle
 * semantics, exact value written, Class-D reason vocabulary — but stamps
 * THIS unit only. The line-level `receiving_line_testing.serial_absent` is
 * never set or cleared here (plan: per-unit-no-serial-EXECUTION-PROMPT.md §3).
 *
 * `{ absent: true, reason }` sets the waiver; `{ absent: false }` clears it
 * (reason forced to null). withAuth (no extra permission) matches the
 * line-level route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';

export const POST = withAuth(async (request: NextRequest, ctx) => {
  // withAuth ignores Next route `params` — parse from the pathname, same as
  // the line-level serial-absent route.
  const segments = request.nextUrl.pathname.split('/');
  const linesIdx = segments.indexOf('lines');
  const unitsIdx = segments.indexOf('units');
  const lineId = Number(segments[linesIdx + 1]);
  const unitId = Number(segments[unitsIdx + 1]);
  if (!Number.isFinite(lineId) || lineId <= 0) {
    return NextResponse.json({ success: false, error: 'invalid line id' }, { status: 400 });
  }
  if (!Number.isFinite(unitId) || unitId <= 0) {
    return NextResponse.json({ success: false, error: 'invalid unit id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const absent = body.absent === true;
  const rawReason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const reason = absent ? rawReason || 'NOT_SERIALIZED' : null;

  const updated = await withTenantTransaction(ctx.organizationId, async (client) => {
    const lineRes = await client.query<{ id: number; receiving_id: number | null }>(
      `SELECT id, receiving_id FROM receiving_line
        WHERE id = $1 AND organization_id = $2
        FOR UPDATE`,
      [lineId, ctx.organizationId],
    );
    const line = lineRes.rows[0];
    if (!line) return null;

    const unitRes = await client.query<{
      id: number;
      receiving_line_id: number;
      ordinal: number;
      serial_unit_id: number | null;
      serial_absent: boolean;
      serial_absent_reason: string | null;
      condition_grade: string | null;
    }>(
      `UPDATE receiving_line_unit
          SET serial_absent = $3,
              serial_absent_reason = $4,
              updated_at = now()
        WHERE organization_id = $1
          AND receiving_line_id = $2
          AND id = $5
      RETURNING id, receiving_line_id, ordinal, serial_unit_id,
                serial_absent, serial_absent_reason,
                condition_grade::text AS condition_grade`,
      [ctx.organizationId, lineId, absent, reason, unitId],
    );
    const unit = unitRes.rows[0];
    if (!unit) return { notFound: 'unit' as const, line: null, unit: null };

    return {
      notFound: null,
      line: { id: line.id, receiving_id: line.receiving_id },
      unit: {
        id: Number(unit.id),
        receiving_line_id: Number(unit.receiving_line_id),
        ordinal: Number(unit.ordinal),
        serial_unit_id: unit.serial_unit_id != null ? Number(unit.serial_unit_id) : null,
        serial_absent: !!unit.serial_absent,
        serial_absent_reason: unit.serial_absent_reason,
        condition_grade: unit.condition_grade,
      },
    };
  });

  if (!updated) {
    return NextResponse.json(
      { success: false, error: `line ${lineId} not found` },
      { status: 404 },
    );
  }
  if (updated.notFound === 'unit') {
    return NextResponse.json(
      { success: false, error: `unit ${unitId} not found on line ${lineId}` },
      { status: 404 },
    );
  }

  after(async () => {
    try {
      await invalidateReceivingViews(ctx.organizationId);
      if (updated.line?.receiving_id != null) {
        await publishReceivingLogChanged({
          organizationId: ctx.organizationId,
          action: 'update',
          rowId: String(updated.line.receiving_id),
          source: 'receiving.lines.units.serial-absent',
        });
      }
    } catch (err) {
      console.warn('lines/units/serial-absent: cache/realtime update failed', err);
    }
  });

  return NextResponse.json({ success: true, line: updated.line, unit: updated.unit });
});
