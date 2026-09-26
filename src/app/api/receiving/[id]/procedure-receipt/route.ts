/** GET /api/receiving/[id]/procedure-receipt */

import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveUnboxProcedureReceipt } from '@/lib/receiving/procedure-receipt-resolve';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  async (request: NextRequest, ctx) => {
    try {
      const segments = request.nextUrl.pathname.split('/');
      const receivingId = Number(segments[segments.indexOf('receiving') + 1]);
      if (!Number.isFinite(receivingId) || receivingId <= 0) {
        throw ApiError.badRequest('Valid receiving id is required');
      }

      const receipt = await resolveUnboxProcedureReceipt(
        ctx.organizationId as OrgId,
        receivingId,
      );
      if (!receipt) throw ApiError.notFound('receiving', receivingId);

      return NextResponse.json({ success: true, ...receipt });
    } catch (error) {
      return errorResponse(error, 'GET /api/receiving/[id]/procedure-receipt');
    }
  },
  { permission: 'receiving.view' },
);
