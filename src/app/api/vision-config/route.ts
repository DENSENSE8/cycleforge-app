import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';

export const dynamic = 'force-dynamic';

/** GET /api/vision-config → { baseUrl } */
export const GET = withAuth(
  async (_req: NextRequest) => {
    const baseUrl = (process.env.NEXT_PUBLIC_VISION_BASE_URL || '').replace(/\/+$/, '');
    return NextResponse.json({ baseUrl });
  },
  { permission: 'receiving.view' },
);
