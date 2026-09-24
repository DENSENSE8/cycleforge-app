import { NextResponse } from 'next/server';
import type { OrgId } from '@/lib/tenancy/constants';
import { loadOrgEnvironment } from './environment';
import {
  resolveQaCapability,
  type QaCapability,
  type QaToolPermission,
} from './capabilities';

export async function loadQaCapability(
  orgId: OrgId,
  permissions: ReadonlySet<string>,
  required: QaToolPermission = 'developer.qa_tools.view',
): Promise<QaCapability> {
  const environment = await loadOrgEnvironment(orgId);
  return resolveQaCapability({
    environment,
    permissions,
    required,
    orgFound: true,
  });
}

/**
 * 404 for customer orgs (do not advertise the console).
 * 403 when the sandbox org's staff lacks the permission.
 */
export function qaCapabilityResponse(cap: QaCapability): NextResponse | null {
  if (cap.allowed) return null;
  if (cap.reason === 'not_sandbox' || cap.reason === 'org_not_found') {
    return NextResponse.json({ success: false, error: 'NOT_FOUND' }, { status: 404 });
  }
  return NextResponse.json(
    { success: false, error: 'FORBIDDEN', reason: cap.reason },
    { status: 403 },
  );
}

export async function assertQaCapability(
  orgId: OrgId,
  permissions: ReadonlySet<string>,
  required: QaToolPermission,
): Promise<{ cap: QaCapability } | { denied: NextResponse }> {
  const cap = await loadQaCapability(orgId, permissions, required);
  const denied = qaCapabilityResponse(cap);
  if (denied) return { denied };
  return { cap };
}
