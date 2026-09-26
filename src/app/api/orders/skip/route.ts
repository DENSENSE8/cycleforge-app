import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';

/**
 * POST /api/orders/skip - Skip an order for a technician
 * NOTE: skipped_by column was removed from DB, so this is currently a no-op
 */
export const POST = withAuth(async (req: NextRequest, _ctx) => {
  const { orderId } = await req.json();

  if (!orderId) {
    return NextResponse.json(
      { error: 'orderId is required' },
      { status: 400 }
    );
  }

  // skipped_by column was removed from DB, so we just return success
  return NextResponse.json({ success: true, message: 'Skip acknowledged (feature disabled)' });
}, { permission: 'tech.scan_serial' });
