/**
 * The phone task list's ticket-status filter (owner 2026-09-30): which tasks a
 * set of helpdesk statuses keeps. A task carries a status when its anchor
 * ticket OR any ticket it links (`work_assignment_links`, `SUPPORT_TICKET`)
 * has it. Several statuses OR together.
 */

import { TICKET_STATUSES, parseTicketStatus, type TicketStatus } from '@/design-system/tokens/ticket-status';
import type { TaskLinkFace } from './task-links-shared';

/** What a task row carries: its anchor ticket and its link faces. */
export interface TicketStatusSource {
  ticket: { status: string | null } | null;
  links: readonly TaskLinkFace[];
}

/** Every house status this task's tickets are in — the anchor's and each linked ticket's. */
export function taskTicketStatuses(row: TicketStatusSource): Set<TicketStatus> {
  const out = new Set<TicketStatus>();
  const anchor = parseTicketStatus(row.ticket?.status);
  if (anchor) out.add(anchor);
  for (const link of row.links) {
    const status = link.kind === 'ticket' ? parseTicketStatus(link.status) : null;
    if (status) out.add(status);
  }
  return out;
}

/** Does this task pass the filter? An empty filter passes everything. */
export function taskMatchesTicketStatuses(row: TicketStatusSource, statuses: readonly TicketStatus[]): boolean {
  if (statuses.length === 0) return true;
  const own = taskTicketStatuses(row);
  return statuses.some((status) => own.has(status));
}

/** Tasks per status — a task with tickets in two statuses counts under both (each chip shows what tapping it alone keeps). */
export function ticketStatusCounts(rows: Iterable<TicketStatusSource>): Record<TicketStatus, number> {
  const counts = Object.fromEntries(TICKET_STATUSES.map((status) => [status, 0])) as Record<TicketStatus, number>;
  for (const row of rows) for (const status of taskTicketStatuses(row)) counts[status] += 1;
  return counts;
}
