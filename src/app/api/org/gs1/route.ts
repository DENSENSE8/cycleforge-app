import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveOrgGs1Identity } from '@/lib/interop/org-gs1';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The tenant's RESOLVED GS1 identity, for the browser. */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const identity = await resolveOrgGs1Identity(ctx.organizationId);
  return NextResponse.json({
    gln: identity.gln ?? '',
    companyPrefix: identity.companyPrefix ?? '',
  });
}, { permission: 'print.label' });
