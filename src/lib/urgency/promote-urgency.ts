import 'server-only';

import type { OrgId } from '@/lib/tenancy/constants';

import { createUrgencyDeps } from './promote-urgency-deps';
import {
  promoteUrgencyCore,
  type PromoteUrgencyInput,
  type PromoteUrgencyResult,
  type UrgencyDeps,
} from './promote-urgency-core';

/** Server entry point for the cross-entity urgency SoT. */
export async function promoteUrgency(
  organizationId: OrgId,
  input: PromoteUrgencyInput,
  deps: UrgencyDeps = createUrgencyDeps(organizationId),
): Promise<PromoteUrgencyResult> {
  return promoteUrgencyCore(input, deps);
}
