/** Task **follow-ups** — the pure half: body normalisation and row mapping. */

import {
  TASK_FOLLOW_UP_CHANNELS,
  TASK_FOLLOW_UP_FUTURE_SKEW_MS,
  type TaskFollowUp,
  type TaskFollowUpChannel,
  type TaskFollowUpCreateBody,
  type TaskFollowUpDirection,
  type TaskFollowUpRefusal,
} from './task-follow-ups-shared';

/** What the writer inserts, after normalisation. */
export interface NormalizedTaskFollowUp {
  channel: Exclude<TaskFollowUpChannel, 'email'>;
  direction: TaskFollowUpDirection;
  /** ISO; always set (defaulted to `now`). */
  occurredAt: string;
  body: string | null;
  /** `undefined` = leave `next_follow_up_at` alone; `null` clears it. */
  nextFollowUpAt: string | null | undefined;
}

export type NormalizeTaskFollowUpResult =
  | { ok: true; value: NormalizedTaskFollowUp }
  | { ok: false; reason: Exclude<TaskFollowUpRefusal, 'task_not_found'> };

function blankToNull(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  return t ? t : null;
}

function isoOrNull(raw: string): string | null {
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Trim, default and gate one follow-up. Length caps live in the route's Zod
 * schema; this owns the rules that need the clock or the channel. A NEW email
 * row is refused — emails are linked under Links; old email rows stay readable.
 */
export function normalizeTaskFollowUp(
  body: TaskFollowUpCreateBody,
  nowMs: number,
): NormalizeTaskFollowUpResult {
  if (body.channel === 'email') return { ok: false, reason: 'email_is_a_link' };
  const channel = body.channel;

  let occurredAt = new Date(nowMs).toISOString();
  if (body.occurredAt !== undefined) {
    const iso = isoOrNull(body.occurredAt);
    if (!iso) return { ok: false, reason: 'invalid_instant' };
    if (Date.parse(iso) > nowMs + TASK_FOLLOW_UP_FUTURE_SKEW_MS) {
      return { ok: false, reason: 'occurred_in_future' };
    }
    occurredAt = iso;
  }

  let nextFollowUpAt: string | null | undefined;
  if (body.nextFollowUpAt === null) nextFollowUpAt = null;
  else if (body.nextFollowUpAt !== undefined) {
    const iso = isoOrNull(body.nextFollowUpAt);
    if (!iso) return { ok: false, reason: 'invalid_instant' };
    nextFollowUpAt = iso;
  }

  return {
    ok: true,
    value: {
      channel,
      direction: body.direction ?? 'outbound',
      occurredAt,
      body: blankToNull(body.body),
      nextFollowUpAt,
    },
  };
}

function toIso(raw: unknown): string | null {
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === 'string') return isoOrNull(raw);
  return null;
}

function toText(raw: unknown): string | null {
  return typeof raw === 'string' && raw !== '' ? raw : null;
}

/** One `work_assignment_follow_ups` row (joined staff name) → wire; null for drift. */
export function mapTaskFollowUpRow(row: Record<string, unknown>): TaskFollowUp | null {
  const channel = row.channel;
  if (typeof channel !== 'string' || !(TASK_FOLLOW_UP_CHANNELS as readonly string[]).includes(channel)) {
    return null;
  }
  const occurredAt = toIso(row.occurred_at);
  if (!occurredAt) return null;
  const staffId = row.staff_id == null ? null : Number(row.staff_id);
  return {
    id: Number(row.id),
    taskId: Number(row.assignment_id),
    channel: channel as TaskFollowUpChannel,
    direction: row.direction === 'inbound' ? 'inbound' : 'outbound',
    occurredAt,
    staffId,
    staffName: toText(row.staff_name),
    emailTo: toText(row.email_to),
    emailSubject: toText(row.email_subject),
    body: toText(row.body),
    createdAt: toIso(row.created_at) ?? occurredAt,
  };
}
