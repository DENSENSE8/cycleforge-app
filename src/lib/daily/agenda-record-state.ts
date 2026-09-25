/**
 * One agenda row's STATE, read once for the ledger record and the evidence
 * column so the spine, the band-1 code and the evidence strip can never
 * disagree about the same row.
 *
 * The ledger's spine colour comes from `LIFECYCLE` (the design system's only
 * state palette), but its WORDS are an order's — `SHP · Shipped` on a finished
 * task would be a lie. So the lifecycle state is borrowed for its tone only
 * and the code / word are this module's own:
 *
 * | Row | Code | Spine |
 * |---|---|---|
 * | done (either half) | `DONE` | shipped (success) |
 * | withdrawn task | `CXL` | packed (neutral fulfilment) |
 * | past its due instant | `LATE` | urgent |
 * | urgent task | `URG` | urgent |
 * | task in progress | `WIP` | ready |
 * | anything else open | `OPEN` / `DUE` | ready |
 */

import type { LifecycleState } from '@cycleforge/design-tokens';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';
import type { DailyAgendaRow } from './daily-agenda-row';

export interface AgendaRecordState {
  lifecycle: LifecycleState;
  code: string;
  word: string;
  /** Late work reads in the danger ink; everything else in the region's ink. */
  late: boolean;
  /** The row's next verb, or null when it is finished. */
  next: string | null;
}

const CIVIL_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: WAREHOUSE_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `HH:MM` on the warehouse wall at `nowMs` — what a checklist due time is compared to. */
export function warehouseClock(nowMs: number): string {
  return CIVIL_CLOCK.format(nowMs);
}

export function agendaRecordState(row: DailyAgendaRow, nowMs: number, isToday: boolean): AgendaRecordState {
  if (row.type === 'checklist') {
    if (row.done) return { lifecycle: 'shipped', code: 'DONE', word: 'Checked', late: false, next: null };
    // A checklist due time is a wall-clock time on the day being viewed; only
    // TODAY can be past it (a browsed yesterday is a record, not a deadline).
    const late = isToday && row.dueTime != null && warehouseClock(nowMs) > row.dueTime;
    if (late) return { lifecycle: 'urgent', code: 'LATE', word: 'Past due', late: true, next: 'Check off' };
    return {
      lifecycle: 'ready',
      code: row.dueTime ? 'DUE' : 'OPEN',
      word: row.dueTime ? 'Due today' : 'Open',
      late: false,
      next: 'Check off',
    };
  }

  if (row.status === 'DONE') return { lifecycle: 'shipped', code: 'DONE', word: 'Done', late: false, next: null };
  if (row.status === 'CANCELED') {
    return { lifecycle: 'packed', code: 'CXL', word: 'Withdrawn', late: false, next: null };
  }
  const late = row.deadlineAtMs != null && row.deadlineAtMs < nowMs;
  const started = row.status === 'IN_PROGRESS';
  const next = started ? 'Finish' : 'Start';
  if (late) return { lifecycle: 'urgent', code: 'LATE', word: 'Past due', late: true, next };
  if (row.urgency === 'urgent') return { lifecycle: 'urgent', code: 'URG', word: 'Urgent', late: false, next };
  if (started) return { lifecycle: 'ready', code: 'WIP', word: 'In progress', late: false, next };
  return { lifecycle: 'ready', code: 'OPEN', word: 'Open', late: false, next };
}
