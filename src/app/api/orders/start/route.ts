import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';

/** POST /api/orders/start - DEPRECATED */
export const POST = withAuth(async (req: NextRequest, _ctx) => {
  const { orderId } = await req.json();

  if (!orderId) {
    return NextResponse.json(
      { error: 'orderId is required' },
      { status: 400 }
    );
  }

  // No-op: assignment now happens when a tech scans the tracking number.
  return NextResponse.json({
    success: true,
    message: 'Order assignment now happens automatically when tech scans tracking number'
  });
}, { permission: 'tech.scan_serial' });
