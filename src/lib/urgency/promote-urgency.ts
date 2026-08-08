import 'server-only';

import type { OrgId } from '@/lib/tenancy/constants';

import { createUrgencyDeps } from './promote-urgency-deps';
import {
  promoteUrgencyCore,
  type PromoteUrgencyInput,
  type PromoteUrgencyResult,
  type UrgencyDeps,
} from './promote-urgency-core';

/**
 * Server entry point for the cross-entity urgency SoT.
 *
 * The one call a route makes when it holds an `(entityType, entityId)` it did
 * not choose — a resolved scan, a thrown task, a bulk triage action — and wants
 * that record urgent without knowing which of three storages that means.
 *
 * Not to be confused with the three multi-field PATCH routes that write an
 * urgency column inline as part of a wider UPDATE; those are deliberately left
 * alone (see `promote-urgency-core.ts` → What this is NOT).
 *
 * `deps` is injectable for tests that want the real routing over fake storage;
 * production callers pass the orgId and nothing else.
 */
export async function promoteUrgency(
  organizationId: OrgId,
  input: PromoteUrgencyInput,
  deps: UrgencyDeps = createUrgencyDeps(organizationId),
): Promise<PromoteUrgencyResult> {
  return promoteUrgencyCore(input, deps);
}
