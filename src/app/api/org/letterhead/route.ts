import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrgLetterhead } from '@/lib/branding/letterhead';
import { getOrganization } from '@/lib/tenancy/organizations';
import type { OrgId } from '@/lib/tenancy/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/org/letterhead — workspace letterhead for on-screen repair / receipt
 * previews. Any signed-in staff may read their own org's letterhead (print
 * routes already load it server-side).
 */
export const GET = withAuth(async (_req, ctx) => {
  const org = await getOrganization(ctx.organizationId as OrgId);
  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }
  return NextResponse.json(
    getOrgLetterhead({ name: org.name, settings: org.settings }),
  );
});
