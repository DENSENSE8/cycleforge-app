import 'server-only';

import type { OrgId } from '@/lib/tenancy/constants';

import { createTaskDeps } from './create-task-deps';
import {
  createTaskCore,
  type CreateTaskDeps,
  type CreateTaskInput,
  type CreateTaskResult,
} from './create-task-core';

/**
 * Server entry point for throwing a task at a colleague.
 *
 * One call: creates the `FOLLOW_UP` work_assignment and, when the thrower
 * marked it urgent, promotes the underlying record through the cross-entity
 * urgency SoT. The promotion is allowed to fail without failing the throw —
 * see `create-task-core.ts`.
 *
 * `deps` is injectable so a test can exercise the real routing over fake
 * storage; production callers pass the orgId and nothing else.
 */
export async function createTask(
  organizationId: OrgId,
  input: CreateTaskInput,
  deps: CreateTaskDeps = createTaskDeps(organizationId),
): Promise<CreateTaskResult> {
  return createTaskCore(input, deps);
}
