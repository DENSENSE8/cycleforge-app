/** PATCH /api/receiving/lines/[id]/units/[unitId]/condition */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { CONDITION_GRADES, type ConditionGrade } from '@/lib/conditions';

function normalizeGrade(raw: unknown): ConditionGrade | null {
  if (raw == null) return null;
  const upper = String(raw).trim().toUpperCase().replace(/[\s-]/g, '_');
  return (CONDITION_GRADES as readonly string[]).includes(upper)
    ? (upper as ConditionGrade)
    : null;
}

export const PATCH = withAuth(async (request: NextRequest, ctx) => {
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

  const grade = normalizeGrade(body.condition_grade);
  // null / '' clears the per-unit grade (column is nullable).
  const clearing =
    body.condition_grade === null ||
    body.condition_grade === '' ||
    (typeof body.condition_grade === 'string' && !body.condition_grade.trim());
  if (!clearing && !grade) {
    return NextResponse.json(
      {
        success: false,
        error: `condition_grade must be one of: ${CONDITION_GRADES.join(', ')} (or null to clear)`,
      },
      { status: 400 },
    );
  }
  const nextGrade = clearing ? null : grade;

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
          SET condition_grade = $3::condition_grade_enum,
              updated_at = now()
        WHERE organization_id = $1
          AND receiving_line_id = $2
          AND id = $4
      RETURNING id, receiving_line_id, ordinal, serial_unit_id,
                serial_absent, serial_absent_reason,
                condition_grade::text AS condition_grade`,
      [ctx.organizationId, lineId, nextGrade, unitId],
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
          source: 'receiving.lines.units.condition',
        });
      }
    } catch (err) {
      console.warn('lines/units/condition: cache/realtime update failed', err);
    }
  });

  return NextResponse.json({ success: true, line: updated.line, unit: updated.unit });
});
