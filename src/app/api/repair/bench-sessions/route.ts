import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { publishRepairChanged } from '@/lib/realtime/publish';
import { parseBody } from '@/lib/schemas/parse';
import { RepairBenchSessionBody } from '@/lib/schemas/repair-actions';
import {
  listBenchSessions,
  startBenchSession,
  stopBenchSession,
} from '@/lib/repair/bench-session-queries';

/**
 * GET /api/repair/bench-sessions?repairId={id}
 *
 * Every bench timer on the repair (newest first), the caller's open one, and
 * the server clock the phone ticks a running timer against.
 */
export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const repairId = Number(req.nextUrl.searchParams.get('repairId'));
    if (!Number.isInteger(repairId) || repairId <= 0) {
      return NextResponse.json({ error: 'repairId is required' }, { status: 400 });
    }
    try {
      return NextResponse.json(await listBenchSessions(ctx.organizationId, ctx.staffId, repairId));
    } catch (error: unknown) {
      console.error('GET /api/repair/bench-sessions error:', error);
      return NextResponse.json({ error: 'Failed to load bench timer' }, { status: 500 });
    }
  },
  { permission: 'repair.view' },
);

/**
 * POST /api/repair/bench-sessions — { repairId, action: 'start' | 'stop' }
 *
 * Start / stop the caller's own timer. Both stamps are the database's NOW();
 * the body carries no time. Start is idempotent (returns the open session);
 * Stop with nothing running is 409.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const raw = await req.json().catch(() => ({}));
    const parsed = parseBody(RepairBenchSessionBody, raw);
    if (parsed instanceof NextResponse) return parsed;

    try {
      const write = parsed.action === 'start' ? startBenchSession : stopBenchSession;
      const result = await write(ctx.organizationId, ctx.staffId, parsed.repairId);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

      if (result.changed) {
        await invalidateCacheTags(['repair-service']);
        await publishRepairChanged({
          organizationId: ctx.organizationId,
          repairIds: [parsed.repairId],
          source: parsed.action === 'start' ? 'repair.bench-started' : 'repair.bench-stopped',
        });
      }
      return NextResponse.json({
        success: true,
        session: result.session,
        changed: result.changed,
        serverNow: result.serverNow,
      });
    } catch (error: unknown) {
      console.error('POST /api/repair/bench-sessions error:', error);
      return NextResponse.json({ error: 'Failed to update bench timer' }, { status: 500 });
    }
  },
  { permission: 'repair.mark_repaired' },
);
