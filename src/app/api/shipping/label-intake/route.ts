import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import type { OrgId } from '@/lib/tenancy/constants';
import { IntakeRefSchema } from '@/lib/schemas/label-intake';
import { lookupLabelIntake } from '@/lib/shipping/label-intake';
import { labelIntakeErrorResponse } from '@/lib/shipping/label-intake-errors';

export const dynamic = 'force-dynamic';

/** GET /api/shipping/label-intake?ref=<order number> */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const parsed = IntakeRefSchema.safeParse(req.nextUrl.searchParams.get('ref') ?? '');
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Enter an order number (2–64 characters).' }, { status: 400 });
    }
    const lookup = await lookupLabelIntake(ctx.organizationId as OrgId, parsed.data);
    return NextResponse.json({ ok: true, ...lookup });
  } catch (error) {
    return labelIntakeErrorResponse(error, 'GET /api/shipping/label-intake');
  }
}, { permission: 'shipping.view' });
