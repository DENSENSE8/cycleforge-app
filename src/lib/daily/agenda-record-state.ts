/** One agenda row's STATE, read once for the ledger record and the evidence column so the spine, the band-1 code and the evidence strip can… */

import { AGENDA_LIFECYCLE, type AgendaStage } from '@/design-system/tokens/agenda-lifecycle';
import type { RecordStateFace } from '@/design-system/tokens/industrial-record';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';
import type { DailyAgendaRow } from './daily-agenda-row';

interface AgendaRecordState {
  /** The agenda's own state face (tone + glyph), wearing this row's code and word. */
  face: RecordStateFace;
  code: string;
  word: string;
  /** Late work reads in the danger ink; everything else in the region's ink. */
  late: boolean;
  /** The row's next verb, or null when it is finished. */
  next: string | null;
}

function agendaState(stage: AgendaStage, code: string, word: string, late: boolean, next: string | null): AgendaRecordState {
  return { face: { ...AGENDA_LIFECYCLE[stage], code, label: word }, code, word, late, next };
}

const CIVIL_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: WAREHOUSE_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `HH:MM` on the warehouse wall at `nowMs` — what a checklist due time is compared to. */
function warehouseClock(nowMs: number): string {
  return CIVIL_CLOCK.format(nowMs);
}

export function agendaRecordState(row: DailyAgendaRow, nowMs: number, isToday: boolean): AgendaRecordState {
  if (row.type === 'checklist') {
    if (row.done) return agendaState('done', 'DONE', 'Checked', false, null);
    // A checklist due time is a wall-clock time on the day being viewed; only
    // TODAY can be past it (a browsed yesterday is a record, not a deadline).
    const late = isToday && row.dueTime != null && warehouseClock(nowMs) > row.dueTime;
    if (late) return agendaState('late', 'LATE', 'Past due', true, 'Check off');
    return row.dueTime
      ? agendaState('open', 'DUE', 'Due today', false, 'Check off')
      : agendaState('open', 'OPEN', 'Open', false, 'Check off');
  }

  if (row.status === 'DONE') return agendaState('done', 'DONE', 'Done', false, null);
  if (row.status === 'CANCELED') return agendaState('withdrawn', 'CXL', 'Withdrawn', false, null);
  const late = row.deadlineAtMs != null && row.deadlineAtMs < nowMs;
  const started = row.status === 'IN_PROGRESS';
  const next = started ? 'Finish' : 'Start';
  if (late) return agendaState('late', 'LATE', 'Past due', true, next);
  if (row.urgency === 'urgent') return agendaState('urgent', 'URG', 'Urgent', false, next);
  if (started) return agendaState('active', 'WIP', 'In progress', false, next);
  return agendaState('open', 'OPEN', 'Open', false, next);
}
