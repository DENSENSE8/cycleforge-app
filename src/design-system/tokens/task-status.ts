/**
 * A task's status as every surface paints it — THE one map (owner
 * 2026-09-30: "Status needs an upgrade, like follow-up, pending, and more …
 * acknowledge different statuses"). The record's combobox and slider, the
 * `S` picker, the board row's line-2 pill, the `?filter=` segment, the
 * Timeline's "Moved to …" and the phone sheet + rows all read it.
 *
 * Storage (`src/lib/tasks/task-status.ts`): the lifecycle stays in
 * `work_assignments.status` (`assignment_status_enum`, shared with station
 * work), and the three HOLDS are `work_assignments.task_state` on open work —
 * so a Pending task is still open to every lane, count and sync.
 *
 * Inks: `*-50` ground, `*-700` ink, `*-200` ring — each re-stepped under
 * `html[data-color-scheme='dark']` in `src/styles/globals.css`, the same
 * audited pairs as `ticket-status.ts`; pill text ≥ 4.5:1 in both themes.
 */

import {
  Circle,
  CircleCheck,
  CircleDot,
  CircleSlash,
  Hourglass,
  OctagonAlert,
  Send,
  type LucideIcon,
} from 'lucide-react';
import type { StateName } from './lifecycle';

/** In the order an operator walks them — the combobox's rows and its digit keys. */
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'PENDING', 'FOLLOW_UP', 'BLOCKED', 'DONE', 'CANCELED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** The states stored in `work_assignments.task_state` — a hold on OPEN work. */
export const TASK_HOLDS = ['PENDING', 'FOLLOW_UP', 'BLOCKED'] as const;
export type TaskHold = (typeof TASK_HOLDS)[number];

export interface TaskStatusFace {
  label: string;
  /** Short code for dense faces and the audit read-out. */
  code: string;
  /** One line under the label in the combobox: what the state means here. */
  hint: string;
  /** `STATE_TONE_CLASSES` name, for surfaces that speak the lifecycle tones. */
  tone: StateName;
  icon: LucideIcon;
  /** The combobox's one-key: type it alone and Enter. */
  letter: string;
  /** Words the combobox also matches (`parts` finds Blocked). */
  aliases: readonly string[];
  /** Tinted ground + ink. */
  pill: string;
  /** Pill ring colour (pair with `ring-1`). */
  ring: string;
  /** Glyph / word ink on the card. */
  ink: string;
  /** The saturated dot. */
  dot: string;
}

export const TASK_STATUS_FACE: Readonly<Record<TaskStatus, TaskStatusFace>> = {
  TODO: {
    label: 'To do',
    code: 'TODO',
    hint: 'Not started yet',
    tone: 'neutral',
    icon: Circle,
    letter: 't',
    aliases: ['open', 'not done', 'new', 'reopen'],
    pill: 'bg-surface-sunken text-text-secondary',
    ring: 'ring-border-soft',
    ink: 'text-text-muted',
    dot: 'bg-border-emphasis',
  },
  IN_PROGRESS: {
    label: 'In progress',
    code: 'WIP',
    hint: 'Someone is on it',
    tone: 'info',
    icon: CircleDot,
    letter: 'i',
    aliases: ['doing', 'started', 'working', 'active'],
    pill: 'bg-sky-50 text-sky-700',
    ring: 'ring-sky-200',
    ink: 'text-sky-700',
    dot: 'bg-sky-500',
  },
  PENDING: {
    label: 'Pending',
    code: 'PEND',
    hint: 'Waiting on the customer or a supplier',
    tone: 'warning',
    icon: Hourglass,
    letter: 'p',
    aliases: ['waiting', 'customer', 'supplier', 'awaiting reply'],
    pill: 'bg-amber-50 text-amber-700',
    ring: 'ring-amber-200',
    ink: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  FOLLOW_UP: {
    label: 'Follow-up',
    code: 'FUP',
    hint: 'We owe the next move — call, email, chase',
    tone: 'fulfillment',
    icon: Send,
    letter: 'f',
    aliases: ['chase', 'call back', 'email', 'nudge'],
    pill: 'bg-violet-50 text-violet-700',
    ring: 'ring-violet-200',
    ink: 'text-violet-700',
    dot: 'bg-violet-500',
  },
  BLOCKED: {
    label: 'Blocked',
    code: 'BLK',
    hint: 'Cannot move — awaiting parts, payment or a decision',
    tone: 'danger',
    icon: OctagonAlert,
    letter: 'b',
    aliases: ['parts', 'stuck', 'on hold', 'payment'],
    pill: 'bg-rose-50 text-rose-700',
    ring: 'ring-rose-200',
    ink: 'text-rose-700',
    dot: 'bg-rose-500',
  },
  DONE: {
    label: 'Done',
    code: 'DONE',
    hint: 'Finished',
    tone: 'success',
    icon: CircleCheck,
    letter: 'd',
    aliases: ['complete', 'finished', 'closed', 'resolved'],
    pill: 'bg-emerald-50 text-emerald-700',
    ring: 'ring-emerald-200',
    ink: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  CANCELED: {
    label: 'Canceled',
    code: 'CXL',
    hint: 'Withdrawn — no longer needed (final)',
    tone: 'neutral',
    icon: CircleSlash,
    letter: 'c',
    aliases: ['withdrawn', 'cancel', 'drop'],
    pill: 'bg-surface-sunken text-text-muted',
    ring: 'ring-border-soft',
    ink: 'text-text-muted',
    dot: 'bg-text-faint',
  },
};

export function isTaskStatus(raw: unknown): raw is TaskStatus {
  return typeof raw === 'string' && (TASK_STATUSES as readonly string[]).includes(raw);
}

/** A stored `task_state` → its hold; null when absent or outside the vocabulary. */
export function parseTaskHold(raw: unknown): TaskHold | null {
  return typeof raw === 'string' && (TASK_HOLDS as readonly string[]).includes(raw) ? (raw as TaskHold) : null;
}

export function isTaskHold(status: TaskStatus): status is TaskHold {
  return (TASK_HOLDS as readonly string[]).includes(status);
}

/**
 * The combobox's filter: statuses matching `query`, best first — the one
 * whose letter IS the query, then label prefix, a word start, the letters in
 * order (`dg` → Doing-style), then an alias. Empty query → every status in order.
 */
export function matchTaskStatuses(query: string): TaskStatus[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...TASK_STATUSES];
  const scored: { status: TaskStatus; score: number; at: number }[] = [];
  TASK_STATUSES.forEach((status, at) => {
    const face = TASK_STATUS_FACE[status];
    const label = face.label.toLowerCase();
    let score: number | null = null;
    if (q.length === 1 && face.letter === q) score = 0;
    else if (label.startsWith(q)) score = 1;
    else if (label.split(/[\s-]+/).some((word) => word.startsWith(q))) score = 2;
    else {
      let i = 0;
      for (const ch of label) if (ch === q[i]) i += 1;
      if (i === q.length) score = 3;
      else if (face.aliases.some((alias) => alias.includes(q))) score = 4;
    }
    if (score != null) scored.push({ status, score, at });
  });
  return scored.sort((a, b) => a.score - b.score || a.at - b.at).map((s) => s.status);
}

/**
 * The quick-triage slider's three stops (owner 2026-09-30: "a slider for
 * sliding it to not done or done or pending"). Not done writes To do.
 */
export const TASK_STATUS_SLIDER_STOPS = [
  { status: 'TODO', label: 'Not done' },
  { status: 'PENDING', label: 'Pending' },
  { status: 'DONE', label: 'Done' },
] as const satisfies readonly { status: TaskStatus; label: string }[];

/** Where a status sits on the slider: active work reads Not done, any hold reads Pending. Null for Canceled (off the scale). */
export function taskStatusSliderIndex(status: TaskStatus): number | null {
  if (status === 'CANCELED') return null;
  if (status === 'DONE') return 2;
  return isTaskHold(status) ? 1 : 0;
}
