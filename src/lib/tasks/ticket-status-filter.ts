/**
 * The task desk's ticket-status filter (owner 2026-09-30): which tasks a set
 * of helpdesk statuses keeps. A task carries a status when its anchor ticket
 * OR any ticket it links (`work_assignment_links`, `SUPPORT_TICKET`) has it —
 * `list-tasks.ts` answers the same question in SQL on `status_cache`, so the
 * API's rows and the board's chip counts agree. Several statuses OR together.
 */

import { TICKET_STATUSES, parseTicketStatus, type TicketStatus } from '@/design-system/tokens/ticket-status';
import type { TaskLinkFace } from './task-links-shared';

export type TicketStatusQuery =
  | { ok: true; statuses: readonly TicketStatus[] | null }
  | { ok: false; unknown: string[] };

/** Vocabulary order, no repeats — one spelling per filter, whatever order it was typed in. */
function canonical(keys: Iterable<TicketStatus>): TicketStatus[] {
  const set = new Set(keys);
  return TICKET_STATUSES.filter((status) => set.has(status));
}

/**
 * `GET /api/tasks?ticketStatus=` — strict: a comma list of house statuses
 * (any case). Absent or empty = no filter (`null`); any value outside the
 * vocabulary refuses the whole query, so a typo never reads as "no match".
 */
export function parseTicketStatusQuery(raw: string | null | undefined): TicketStatusQuery {
  const values = (raw ?? '').split(',').map((part) => part.trim()).filter(Boolean);
  if (values.length === 0) return { ok: true, statuses: null };
  const unknown = values.filter((value) => parseTicketStatus(value) == null);
  if (unknown.length > 0) return { ok: false, unknown };
  return { ok: true, statuses: canonical(values.map((value) => parseTicketStatus(value)!)) };
}

/** The board's `?ticket=` — lenient: a hand-edited URL keeps the statuses it spells right. */
export function parseTicketStatusParam(raw: string | null | undefined): TicketStatus[] {
  return canonical((raw ?? '').split(',').flatMap((part) => parseTicketStatus(part) ?? []));
}

/** The `?ticket=` / `ticketStatus=` value for a set, or null when empty (the param leaves the URL). */
export function ticketStatusParam(statuses: Iterable<TicketStatus>): string | null {
  const list = canonical(statuses);
  return list.length > 0 ? list.join(',') : null;
}

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
