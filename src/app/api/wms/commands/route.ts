import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { runWmsCommandOverHttp } from '@/lib/realtime/wms-command-http';

export const runtime = 'nodejs';

/**
 * POST /api/wms/commands — one `WmsExecutionCommand` over HTTP.
 * Same kernel and authority (`orders.view`, the WMS ticket permission) as the
 * `/__wms/attach` socket; the command's `commandId` is its idempotency key, so
 * a retry after a dropped socket replays instead of writing twice.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const raw = await req.json().catch(() => null);
  const result = await runWmsCommandOverHttp(raw, {
    organizationId: ctx.organizationId,
    staffId: ctx.staffId,
    can: (permission) => ctx.permissions.has(permission),
  });
  return NextResponse.json(result.body, { status: result.status });
}, { permission: 'orders.view' });
