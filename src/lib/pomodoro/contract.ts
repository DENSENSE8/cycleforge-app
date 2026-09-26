import { z } from 'zod';

export const FOCUS_CYCLE_MS = 25 * 60 * 1000;
export const FOCUS_CYCLE_SECONDS = FOCUS_CYCLE_MS / 1000;

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}, 'Invalid civil date');
const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const PomodoroTarget = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('task'), id: positiveId }),
  z.strictObject({ kind: z.literal('checklist'), id: positiveId, date: dateKey }),
]);
export type PomodoroTarget = z.infer<typeof PomodoroTarget>;

export const PomodoroCommand = z.union([
  z.strictObject({ kind: z.literal('task'), id: positiveId, action: z.enum(['start', 'pause', 'reset_cycle']) }),
  z.strictObject({ kind: z.literal('checklist'), id: positiveId, date: dateKey, action: z.enum(['start', 'pause', 'reset_cycle']) }),
  z.strictObject({ kind: z.literal('task'), id: positiveId, action: z.literal('view'), clientEventId: z.string().uuid() }),
  z.strictObject({ kind: z.literal('checklist'), id: positiveId, date: dateKey, action: z.literal('view'), clientEventId: z.string().uuid() }),
]);
export type PomodoroCommand = z.infer<typeof PomodoroCommand>;
export type PomodoroAction = 'start' | 'pause' | 'reset_cycle';

export interface PomodoroTimer {
  kind: PomodoroTarget['kind'];
  id: number;
  date: string | null;
  running: boolean;
  elapsedSeconds: number;
  cycleElapsedSeconds: number;
  remainingSeconds: number;
  cycleSeconds: number;
  startedAt: string | null;
  serverNow: string;
}

export interface PomodoroResponse {
  ok: true;
  timer: PomodoroTimer | null;
  activeTimer: PomodoroTimer | null;
  serverNow: string;
  changed?: boolean;
}

export const PomodoroReportQuery = z.strictObject({
  from: dateKey,
  to: dateKey,
  staffId: positiveId.optional(),
}).refine(({ from, to }) => from <= to && (
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 < 31
), 'Report range must be ordered and at most 31 days');

export interface PomodoroReportEvent {
  eventId: string;
  staffId: number;
  staffName: string | null;
  kind: PomodoroTarget['kind'];
  id: number;
  date: string;
  checkDate: string | null;
  event: 'viewed' | 'worked' | 'completed';
  at: string;
  source: string;
  durationSeconds: number | null;
  title: string;
  targetEntityType: string | null;
  targetEntityId: number | null;
}

export interface PomodoroReportRow {
  staffId: number;
  staffName: string | null;
  kind: PomodoroTarget['kind'];
  id: number;
  date: string;
  checkDate: string | null;
  title: string;
  targetEntityType: string | null;
  targetEntityId: number | null;
  viewedAt: string[];
  workedAt: string[];
  completedAt: string[];
  measuredFocusSeconds: number;
}
export interface PomodoroTaskLifecycle {
  taskId: number;
  date: string;
  startedAt: string;
  completedAt: string;
  /** Task wall-clock, not staff-owned or measured hands-on work. */
  elapsedSeconds: number;
}


export interface PomodoroReport {
  ok: true;
  from: string;
  to: string;
  rows: PomodoroReportRow[];
  events: PomodoroReportEvent[];
  taskLifecycles: PomodoroTaskLifecycle[];
}
