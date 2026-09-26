import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getSubstitutionEnforcement, getSubstitutionAllowedNodes } from '@/lib/tenancy/settings';
import { isFulfillmentSubstitution } from '@/lib/feature-flags';
import type { OrgId } from '@/lib/tenancy/constants';
import type { SubstitutionPolicy } from '@/lib/tech/substitution-eligibility';

/** GET /api/fulfillment/substitution-policy — the org's fulfillment-substitution policy, read by the tech/packing station surfaces so they… */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const enabled = isFulfillmentSubstitution();
  const org = await getOrganization(ctx.organizationId as OrgId);
  const enforcement = org ? getSubstitutionEnforcement(org.settings) : 'advisory';
  const allowedNodes: SubstitutionPolicy['allowedNodes'] = org
    ? getSubstitutionAllowedNodes(org.settings)
    : ['pick'];
  const hasPermission =
    ctx.permissions.has('tech.substitute_unit') || ctx.permissions.has('packing.substitute_unit');
  const canSubstitute = enabled && allowedNodes.includes('test') && hasPermission;

  const policy: SubstitutionPolicy = {
    enabled,
    enforcement,
    allowedNodes: [...allowedNodes],
    canSubstitute,
  };
  return NextResponse.json(policy);
}, { permission: 'tech.view' });
