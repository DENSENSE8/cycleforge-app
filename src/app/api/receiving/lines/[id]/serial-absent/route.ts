/** POST /api/receiving/lines/[id]/serial-absent */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const segments = request.nextUrl.pathname.split('/');
  const idIdx = segments.indexOf('lines') + 1;
  const lineId = Number(segments[idIdx]);
  if (!Number.isFinite(lineId) || lineId <= 0) {
    return NextResponse.json({ success: false, error: 'invalid line id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const absent = body.absent === true;
  // Reason is only meaningful when waived; clearing forces it null. A blank/
  // non-string reason on a waiver falls back to the generic vocabulary code so
  // the fact is never a silent blank (mirrors NoSerialControl's default pick).
  const rawReason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const reason = absent ? rawReason || 'NOT_SERIALIZED' : null;

  // Narrow upsert:
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
      serial_absent: boolean;
      serial_absent_reason: string | null;
    }>(
      `INSERT INTO receiving_line_testing (
          receiving_line_id, organization_id, serial_absent, serial_absent_reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (receiving_line_id) DO UPDATE SET
         serial_absent        = EXCLUDED.serial_absent,
         serial_absent_reason = EXCLUDED.serial_absent_reason,
         updated_at           = now()
       RETURNING serial_absent, serial_absent_reason`,
      [lineId, ctx.organizationId, absent, reason],
    );
    return {
      id: line.id,
      receiving_id: line.receiving_id,
      serial_absent: upsert.rows[0].serial_absent,
      serial_absent_reason: upsert.rows[0].serial_absent_reason,
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
          source: 'receiving.lines.serial-absent',
        });
      }
    } catch (err) {
      console.warn('lines/serial-absent: cache/realtime update failed', err);
    }
  });

  return NextResponse.json({ success: true, line: updated });
});
