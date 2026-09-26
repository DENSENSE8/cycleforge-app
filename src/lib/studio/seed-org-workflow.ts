/** seed-org-workflow — dogfood / script backfill only. */

import type { OrgId } from '@/lib/tenancy/constants';
import { installTemplateIntoOrg } from './install-template';

export async function seedDefaultWorkflowForOrg(orgId: OrgId, staffId: number): Promise<void> {
  await installTemplateIntoOrg({ orgId, staffId, activate: 'if_system', skipIfExists: true });
}
