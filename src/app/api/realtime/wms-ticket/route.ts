import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { signWmsGatewayTicket } from '@/lib/realtime/wms-ticket';
import { safeRandomUUID } from '@/lib/safe-uuid';

export const runtime = 'nodejs';

export const GET = withAuth(async (request: NextRequest, ctx) => {
  const requestedDevice = request.nextUrl.searchParams.get('deviceId')?.trim();
  const deviceId = (requestedDevice || `mobile-${safeRandomUUID()}`).slice(0, 200);
  const ticket = signWmsGatewayTicket({
    organizationId: ctx.organizationId,
    staffId: ctx.staffId,
    deviceId,
  });
  return NextResponse.json({
    protocol: 'cycleforge.wms.v1',
    deviceId,
    ...ticket,
  });
}, { permission: 'orders.view' });
