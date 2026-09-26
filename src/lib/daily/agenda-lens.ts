/**
 * Agenda **lens** — the desk's tabs over the one Daily display.
 * Operator 2026-09-25: three task systems live in this codebase and they stay
 */

import type { DailyAgendaRow } from './daily-agenda-row';

export const AGENDA_LENSES = ['all', 'checklist', 'task', 'ticket', 'task_ticket'] as const;
export type AgendaLens = (typeof AGENDA_LENSES)[number];

export const AGENDA_LENS_LABEL: Readonly<Record<AgendaLens, string>> = {
  all: 'All',
  checklist: 'Daily checklist',
  task: 'Tasks',
  ticket: 'Tickets',
  task_ticket: 'Tickets in tasks',
};

/** `?tab=` → lens; anything unknown is the unfiltered list. */
export function parseAgendaLens(raw: string | null | undefined): AgendaLens {
  return (AGENDA_LENSES as readonly string[]).includes(raw ?? '') ? (raw as AgendaLens) : 'all';
}

export function agendaLensMatches(
  row: Pick<DailyAgendaRow, 'type' | 'hasTicket'>,
  lens: AgendaLens,
): boolean {
  if (lens === 'all') return true;
  if (lens === 'task_ticket') return row.type === 'task' && row.hasTicket;
  return row.type === lens;
}
