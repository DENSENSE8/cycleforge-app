import { z } from 'zod';

import { TASK_STAFF_ID_MAX } from '@/lib/tasks/create-task-core';
import { TASK_ALERT_NOTE_MAX, TASK_ALERT_RECIPIENTS_MAX } from '@/lib/tasks/task-alerts';

/** POST /api/tasks/[id]/alerts — alert staff to follow up. Omitted `staffIds` = the task's owners; the due instant is parsed by `sendTaskAlert`. */
export const TaskAlertCreateSchema = z.strictObject({
  staffIds: z.array(z.number().int().positive().max(TASK_STAFF_ID_MAX)).min(1).max(TASK_ALERT_RECIPIENTS_MAX).optional(),
  note: z.string().max(TASK_ALERT_NOTE_MAX).nullable().optional(),
  dueAt: z.string().trim().max(64).nullable().optional(),
  clientEventId: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
});
