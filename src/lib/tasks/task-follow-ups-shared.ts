/** Task **follow-ups** — the chase log on a task (`work_assignment_follow_ups`), as the wire and the desk both read it. Client-safe. */

/**
 * Every channel a row may carry. `email` stays readable (append-only history)
 * but is no longer LOGGED here — owner 2026-09-30: an email is linked under the
 * task's Links (`work_assignment_email_refs`), not typed into the chase log.
 */
export const TASK_FOLLOW_UP_CHANNELS = ['email', 'call', 'ticket', 'note'] as const;
export type TaskFollowUpChannel = (typeof TASK_FOLLOW_UP_CHANNELS)[number];

export const TASK_FOLLOW_UP_DIRECTIONS = ['outbound', 'inbound'] as const;
export type TaskFollowUpDirection = (typeof TASK_FOLLOW_UP_DIRECTIONS)[number];

/** Field caps — the route's Zod schema and the pure normaliser share them. */
export const TASK_FOLLOW_UP_BODY_MAX = 20_000;
/** How far ahead of the server clock `occurredAt` may sit (client clock skew). */
export const TASK_FOLLOW_UP_FUTURE_SKEW_MS = 5 * 60_000;

/** One logged follow-up, newest first on the wire. */
export interface TaskFollowUp {
  id: number;
  taskId: number;
  channel: TaskFollowUpChannel;
  direction: TaskFollowUpDirection;
  /** ISO instant the chase happened (operator-set). */
  occurredAt: string;
  staffId: number | null;
  staffName: string | null;
  emailTo: string | null;
  emailSubject: string | null;
  body: string | null;
  createdAt: string;
}

/** `POST /api/tasks/[id]/follow-ups` body. `channel: 'email'` is refused (`email_is_a_link`). */
export interface TaskFollowUpCreateBody {
  channel: TaskFollowUpChannel;
  direction?: TaskFollowUpDirection;
  /** ISO; omitted = now. */
  occurredAt?: string;
  body?: string | null;
  /** ISO sets, `null` clears, omitted leaves `next_follow_up_at` alone. */
  nextFollowUpAt?: string | null;
}

/** `GET /api/tasks/[id]/follow-ups`. */
export interface TaskFollowUpsPayload {
  ok: true;
  followUps: TaskFollowUp[];
}

/** `POST /api/tasks/[id]/follow-ups` (201). */
export interface TaskFollowUpLogPayload {
  ok: true;
  followUp: TaskFollowUp;
}

export type TaskFollowUpRefusal =
  | 'task_not_found'
  | 'email_is_a_link'
  | 'occurred_in_future'
  | 'invalid_instant';

export const TASK_FOLLOW_UP_REFUSAL_COPY: Readonly<Record<TaskFollowUpRefusal, string>> = {
  task_not_found: 'That task no longer exists.',
  email_is_a_link: 'Emails are not logged as follow-ups — link the email under the task’s Links instead.',
  occurred_in_future: 'A follow-up cannot be logged in the future.',
  invalid_instant: 'That date is not a valid instant.',
};
