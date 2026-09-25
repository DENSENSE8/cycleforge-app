/**
 * Agenda **lens** — the desk's tabs over the one Daily display.
 *
 * Operator 2026-09-25: three task systems live in this codebase and they stay
 * three — the daily checklist (`daily_check_items`), the task desk
 * (`work_assignments` FOLLOW_UP) and the helpdesk (`support_tickets`) — but the
 * FRONT END reads them through one display, with tabs:
 *
 * | Tab | Rows |
 * |---|---|
 * | All | every row the scope returns |
 * | Daily checklist | the checklist store |
 * | Tasks | tasks anchored on an order or a carton |
 * | Tickets | tasks anchored on a support ticket (the Ticket band) |
 * | Tickets in tasks | tasks anchored elsewhere that LINK a ticket |
 *
 * "Tickets" and "Tickets in tasks" are deliberately disjoint: the first is a
 * helpdesk thread someone was handed, the second is floor work that happens
 * to have a customer waiting on the thread. A row never appears under both.
 *
 * Pure, so the desk and any later phone face read one declaration.
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
