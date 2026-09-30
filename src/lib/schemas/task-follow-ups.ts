import { z } from 'zod';

import {
  TASK_FOLLOW_UP_BODY_MAX,
  TASK_FOLLOW_UP_CHANNELS,
  TASK_FOLLOW_UP_DIRECTIONS,
} from '@/lib/tasks/task-follow-ups-shared';

/** An ISO-ish instant; the normaliser rejects what `Date.parse` cannot read. */
const instant = z.string().trim().min(1).max(64);

/**
 * POST /api/tasks/[id]/follow-ups — log one chase. `channel` accepts every
 * stored value so a stale `email` client gets the domain refusal
 * (`email_is_a_link`), not a shape error; channel and clock rules live in
 * `normalizeTaskFollowUp`.
 */
export const TaskFollowUpCreateSchema = z.strictObject({
  channel: z.enum(TASK_FOLLOW_UP_CHANNELS),
  direction: z.enum(TASK_FOLLOW_UP_DIRECTIONS).optional(),
  occurredAt: instant.optional(),
  body: z.string().max(TASK_FOLLOW_UP_BODY_MAX).nullable().optional(),
  nextFollowUpAt: instant.nullable().optional(),
});
