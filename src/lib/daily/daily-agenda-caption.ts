/**
 * The ONE grey line under an agenda row's title.
 *
 * A Reminders row is a tick, a title and — at most — one caption. The caption
 * is not a summary of the row: it carries only what DIFFERS from the title, in
 * the order an operator reads it (when it is owed · what it is about · whose
 * it is). Everything else the old slot grid printed in its own column lives one
 * click deeper, in the inspector.
 *
 * Pure and React-free so both the desk list and its render test can ask the
 * question without a renderer, and so the two faces of the agenda cannot drift
 * into two different captions for the same row.
 *
 * The work branch deliberately rhymes with the phone's (`MobileDailyChecklist`
 * — `[due, record] · joined`): the desk adds the ASSIGNEE, because the desk
 * shows the whole org's tasks while the phone shows only yours, so "whose" is
 * the fact that differs there and nowhere else.
 */

import { taskDeadlineFact } from '@/lib/tasks/task-row-facts';
import type { DailyAgendaRow } from './daily-agenda-row';

export interface DailyAgendaCaption {
  /** The joined caption, or `null` when the row has nothing extra to say. */
  text: string | null;
  /**
   * Past its deadline and still open — the only register a caption may raise.
   * A DONE row is never overdue: it was finished, whenever that was.
   */
  overdue: boolean;
}

/** The caption a row paints under its title, at `nowMs`. */
export function dailyAgendaCaption(
  row: Pick<
    DailyAgendaRow,
    'type' | 'title' | 'done' | 'cadence' | 'ownerName' | 'deadlineAtMs' | 'recordLabel' | 'assigneeName'
  >,
  nowMs: number,
): DailyAgendaCaption {
  const checklist = row.type === 'checklist';
  // "Only the exception is marked" — a recurring, unowned check earns no
  // caption at all, so the list stays a column of plain titles.
  const due = checklist ? null : taskDeadlineFact(row.deadlineAtMs, nowMs);
  const parts = checklist
    ? [row.cadence === 'once' ? 'Today only' : null, row.ownerName]
    : [
        due?.text ?? null,
        // A handoff with no words already NAMES its record in the title;
        // repeating it in the caption would be the row saying one fact twice.
        row.recordLabel && row.recordLabel !== row.title ? row.recordLabel : null,
        row.assigneeName,
      ];

  const kept = parts.filter((part): part is string => Boolean(part && part.trim()));
  return {
    text: kept.length > 0 ? kept.join(' · ') : null,
    overdue: Boolean(due?.overdue) && !row.done,
  };
}
