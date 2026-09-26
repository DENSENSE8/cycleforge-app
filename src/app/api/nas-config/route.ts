import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getNasConfigForOperator } from '@/lib/nas-photos-server';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/** Runtime NAS config for the browser. */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const config = await getNasConfigForOperator(ctx.organizationId as OrgId, ctx.staffId);
  return NextResponse.json(config);
}, { permission: 'receiving.view' });
