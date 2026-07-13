/**
 * POST /api/receiving/lines/[id]/label-printed
 *
 * Durable stamp for the Unbox stepper's Print step. Records label_printed_at on
 * receiving_line_testing (first-print wins), replacing the per-browser
 * localStorage marker so the step survives refresh / another device and is
 * auditable. Mirrors the sibling condition route's narrow-column upsert
 * (src/app/api/receiving/lines/[id]/condition/route.ts).
 *
 * Idempotent: re-printing keeps the first stamp (COALESCE), so a retry / reprint
 * is a no-op on the recorded value.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const segments = request.nextUrl.pathname.split('/');
  const idIdx = segments.indexOf('lines') + 1;
  const lineId = Number(segments[idIdx]);
  if (!Number.isFinite(lineId) || lineId <= 0) {
    return NextResponse.json({ success: false, error: 'invalid line id' }, { status: 400 });
  }

  // Narrow upsert: label_printed_at is a receiving_line_testing fact. The row
  // may not exist yet (the other testing columns all carry DB defaults), so we
  // INSERT ... ON CONFLICT and COALESCE-keep the first print. The FOR UPDATE
  // spine read preserves the 404 and locks the line, mirroring the condition
  // route.
  const updated = await withTenantTransaction(ctx.organizationId, async (client) => {
    const lineRes = await client.query<{ id: number; receiving_id: number | null }>(
      `SELECT id, receiving_id FROM receiving_line
        WHERE id = $1 AND organization_id = $2
        FOR UPDATE`,
      [lineId, ctx.organizationId],
    );
    const line = lineRes.rows[0];
    if (!line) return null;
    const upsert = await client.query<{ label_printed_at: string | null }>(
      `INSERT INTO receiving_line_testing (
          receiving_line_id, organization_id, label_printed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (receiving_line_id) DO UPDATE SET
         label_printed_at = COALESCE(receiving_line_testing.label_printed_at, EXCLUDED.label_printed_at),
         updated_at       = now()
       RETURNING label_printed_at::text AS label_printed_at`,
      [lineId, ctx.organizationId],
    );
    return {
      id: line.id,
      receiving_id: line.receiving_id,
      label_printed_at: upsert.rows[0].label_printed_at,
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
          source: 'receiving.lines.label-printed',
        });
      }
    } catch (err) {
      console.warn('lines/label-printed: cache/realtime update failed', err);
    }
  });

  return NextResponse.json({ success: true, line: updated });
});
