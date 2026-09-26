import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getPackingEnforcement } from '@/lib/tenancy/settings';
import type { OrgId } from '@/lib/tenancy/constants';

/** GET /api/packing/policy — the org's packing-checklist enforcement mode, read by the packer surfaces (PackChecklist) so they can apply… */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const org = await getOrganization(ctx.organizationId as OrgId);
  const enforcement = org ? getPackingEnforcement(org.settings) : 'advisory';
  return NextResponse.json({ enforcement });
}, { permission: 'sku_stock.view' });
