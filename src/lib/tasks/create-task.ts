import 'server-only';

import type { OrgId } from '@/lib/tenancy/constants';

import { createTaskDeps } from './create-task-deps';
import {
  createTaskCore,
  type CreateTaskDeps,
  type CreateTaskInput,
  type CreateTaskResult,
} from './create-task-core';

/** Server entry point for throwing a task at a colleague. */
export async function createTask(
  organizationId: OrgId,
  input: CreateTaskInput,
  deps: CreateTaskDeps = createTaskDeps(organizationId),
): Promise<CreateTaskResult> {
  return createTaskCore(input, deps);
}
