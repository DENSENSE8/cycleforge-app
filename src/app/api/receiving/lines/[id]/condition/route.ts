/**
 * PATCH /api/receiving/lines/[id]/condition
 *
 * Inline condition_grade update from the per-line pill row. Used by the
 * UnfoundLineEditPanel — equally valid for Zoho-sourced lines.
 *
 * Scoped narrowly to a single column so the surface stays small and the
 * existing lines/[id]/status (workflow events) endpoint isn't disturbed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';

const ALLOWED_GRADES = ['BRAND_NEW', 'LIKE_NEW', 'REFURBISHED', 'USED_A', 'USED_B', 'USED_C', 'PARTS'] as const;
type Grade = (typeof ALLOWED_GRADES)[number];

function normalizeGrade(raw: unknown): Grade | null {
  if (raw == null) return null;
  const upper = String(raw).trim().toUpperCase().replace(/[\s-]/g, '_');
  return (ALLOWED_GRADES as readonly string[]).includes(upper) ? (upper as Grade) : null;
}

export const PATCH = withAuth(async (request: NextRequest, ctx) => {
  const segments = request.nextUrl.pathname.split('/');
  const idIdx = segments.indexOf('lines') + 1;
  const lineId = Number(segments[idIdx]);
  if (!Number.isFinite(lineId) || lineId <= 0) {
    return NextResponse.json(
      { success: false, error: 'invalid line id' },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const grade = normalizeGrade(body.condition_grade);
  if (!grade) {
    return NextResponse.json(
      {
        success: false,
        error: `condition_grade must be one of: ${ALLOWED_GRADES.join(', ')}`,
      },
      { status: 400 },
    );
  }

  // Wave-3 writer inversion: condition_grade + condition_set_at are
  // receiving_line_testing facts now. Inline UPSERT (narrow.ts can't express
  // the COALESCE-once first-set stamp): grade always overwrites,
  // condition_set_at keeps the first explicit set — same semantics the old
  // spine UPDATE had. The FOR UPDATE spine read preserves the 404 and locks
  // the line for the duration, like the former single-statement UPDATE did.
  const updated = await withTenantTransaction(ctx.organizationId, async (client) => {
    const lineRes = await client.query<{ id: number; receiving_id: number | null }>(
      `SELECT id, receiving_id FROM receiving_line
        WHERE id = $1 AND organization_id = $2
        FOR UPDATE`,
      [lineId, ctx.organizationId],
    );
    const line = lineRes.rows[0];
    if (!line) return null;
    const upsert = await client.query<{
      condition_grade: Grade;
      condition_set_at: string | null;
    }>(
      `INSERT INTO receiving_line_testing (
          receiving_line_id, organization_id, condition_grade, condition_set_at)
       VALUES ($1, $2, $3::condition_grade_enum, NOW())
       ON CONFLICT (receiving_line_id) DO UPDATE SET
         condition_grade  = EXCLUDED.condition_grade,
         condition_set_at = COALESCE(receiving_line_testing.condition_set_at, EXCLUDED.condition_set_at),
         updated_at       = now()
       RETURNING condition_grade::text AS condition_grade,
                 condition_set_at::text AS condition_set_at`,
      [lineId, ctx.organizationId, grade],
    );
    return {
      id: line.id,
      receiving_id: line.receiving_id,
      condition_grade: upsert.rows[0].condition_grade,
      condition_set_at: upsert.rows[0].condition_set_at,
    };
  });
  if (!updated) {
    return NextResponse.json(
      { success: false, error: `line ${lineId} not found` },
      { status: 404 },
    );
  }

  after(async () => {
    try {
      await invalidateCacheTags(['receiving-lines', 'receiving-logs']);
      if (updated.receiving_id != null) {
        await publishReceivingLogChanged({
          organizationId: ctx.organizationId,
          action: 'update',
          rowId: String(updated.receiving_id),
          source: 'receiving.lines.condition',
        });
      }
    } catch (err) {
      console.warn('lines/condition: cache/realtime update failed', err);
    }
  });

  return NextResponse.json({ success: true, line: updated });
});
