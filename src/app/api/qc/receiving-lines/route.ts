import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { handleReceivingLinesGet } from '@/app/api/receiving-lines/route';

/** GET /api/qc/receiving-lines */
export const GET = withAuth(
  (request: NextRequest, ctx) => handleReceivingLinesGet(request, ctx, 'testing'),
  { permission: 'tech.qc_pass' },
);
