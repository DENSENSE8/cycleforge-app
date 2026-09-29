import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import {
  issueReceivingUnitLabels,
  ReceivingUnitLabelError,
} from '@/lib/receiving/issue-receiving-unit-labels';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  issuanceVersion: z.string().trim().regex(/^[A-Za-z0-9_-]{8,96}$/),
});

/** POST /api/receiving/lines/[id]/unit-labels — establish and return one product label per physical unit. */
export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    const segments = request.nextUrl.pathname.split('/');
    const lineId = Number(segments[segments.indexOf('lines') + 1]);
    const body = BodySchema.safeParse(await request.json().catch(() => null));
    if (!Number.isInteger(lineId) || lineId <= 0 || !body.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid line id or issuance version' },
        { status: 400 },
      );
    }

    try {
      const result = await issueReceivingUnitLabels(
        {
          lineId,
          issuanceVersion: body.data.issuanceVersion,
          actorStaffId: ctx.staffId ?? null,
        },
        ctx.organizationId as OrgId,
      );
      return NextResponse.json({ success: true, ...result });
    } catch (error) {
      if (error instanceof ReceivingUnitLabelError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      console.error('POST receiving unit labels failed', error);
      return NextResponse.json(
        { success: false, error: 'Could not issue receiving item labels' },
        { status: 500 },
      );
    }
  },
  { permission: 'print.label' },
);
