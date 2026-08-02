/**
 * PATCH /api/receiving/lines/[id]/condition
 *
 * Inline condition_grade update from the per-line pill row. Used by the
 * UnfoundLineEditPanel — equally valid for Zoho-sourced lines.
 *
 * Scoped narrowly to the condition facts so the surface stays small and the
 * existing lines/[id]/status (workflow events) endpoint isn't disturbed.
 *
 * Also the writer of `condition_graded_at` / `condition_graded_by` — the GATE
 * for the Condition procedure step (2026-08-01c). `condition_grade` is NOT NULL
 * with a default, so it exists on a line nobody has touched and can never say
 * whether an operator graded it; this route is the only place that act happens,
 * so this is the only place that records it.
 *
 * `{ reopen: true }` retracts the act (stamp → NULL) without asserting a grade,
 * which is what makes the receipt's "open again to edit" bar honest.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { acknowledgeUnbox } from '@/lib/receiving/acknowledge-unbox';

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

  // Reopen: retract the grading claim without asserting a new grade. The stored
  // grade itself is deliberately left alone — it is NOT NULL and pre-selects the
  // chip when the operator comes back, so a reopen returns them to a
  // confirmation, never to a decision from scratch.
  const reopen = body.reopen === true;

  const grade = reopen ? null : normalizeGrade(body.condition_grade);
  if (!reopen && !grade) {
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

    if (reopen) {
      // Retract the grading act, keep the grade. `condition_set_at` is
      // deliberately untouched: it is the COALESCE-once "first explicit set"
      // stamp and answers a historical question, where `condition_graded_at`
      // answers "does the Condition step currently stand".
      const cleared = await client.query<{
        condition_grade: Grade;
        condition_set_at: string | null;
      }>(
        `UPDATE receiving_line_testing
            SET condition_graded_at = NULL,
                condition_graded_by = NULL,
                updated_at          = now()
          WHERE receiving_line_id = $1 AND organization_id = $2
        RETURNING condition_grade::text AS condition_grade,
                  condition_set_at::text AS condition_set_at`,
        [lineId, ctx.organizationId],
      );
      // No testing row means nothing was ever graded — reopening is a no-op,
      // not a 404: the caller's desired end state (not graded) already holds.
      return {
        id: line.id,
        receiving_id: line.receiving_id,
        condition_grade: cleared.rows[0]?.condition_grade ?? null,
        condition_set_at: cleared.rows[0]?.condition_set_at ?? null,
        condition_graded_at: null,
      };
    }

    const upsert = await client.query<{
      condition_grade: Grade;
      condition_set_at: string | null;
      condition_graded_at: string | null;
    }>(
      // `condition_graded_at` overwrites (NOW() every time) while
      // `condition_set_at` stays COALESCE-once. They are two different
      // questions: "when was a grade FIRST chosen for this line" vs "is the
      // Condition step satisfied right now". The second must be re-stampable
      // after a reopen, or the step could never be completed twice.
      `INSERT INTO receiving_line_testing (
          receiving_line_id, organization_id, condition_grade, condition_set_at,
          condition_graded_at, condition_graded_by)
       VALUES ($1, $2, $3::condition_grade_enum, NOW(), NOW(), $4)
       ON CONFLICT (receiving_line_id) DO UPDATE SET
         condition_grade     = EXCLUDED.condition_grade,
         condition_set_at    = COALESCE(receiving_line_testing.condition_set_at, EXCLUDED.condition_set_at),
         condition_graded_at = EXCLUDED.condition_graded_at,
         condition_graded_by = EXCLUDED.condition_graded_by,
         updated_at          = now()
       RETURNING condition_grade::text AS condition_grade,
                 condition_set_at::text AS condition_set_at,
                 condition_graded_at::text AS condition_graded_at`,
      [lineId, ctx.organizationId, grade, ctx.staffId ?? null],
    );
    // Operator explicitly set the condition — set-once stamp the carton's
    // "Unboxed" milestone (evidence the unit was opened & acknowledged). COALESCE
    // -once inside the helper, and shares this tenant tx so it commits atomically.
    await acknowledgeUnbox(client, ctx.organizationId, line.receiving_id, ctx.staffId ?? null);
    return {
      id: line.id,
      receiving_id: line.receiving_id,
      condition_grade: upsert.rows[0].condition_grade,
      condition_set_at: upsert.rows[0].condition_set_at,
      condition_graded_at: upsert.rows[0].condition_graded_at,
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
      await invalidateReceivingViews(ctx.organizationId);
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
