/**
 * Which helpdesk ticket may a repair's customer update be sent to?
 *
 * `repair_service.ticket_number` is NOT a reliable Zendesk id — walk-ins get
 * `RS-0042` fallbacks and staff can hand-type it. The canonical linkage is
 * `ticket_links` (entity_type 'REPAIR', entity_id = repair id). This module
 * turns those rows plus the typed number into one verdict, and only the
 * `linked` verdict may send: every other state is an honest reason sending
 * is off, because a guess here emails the wrong customer.
 */
import type { OrgId } from '@/lib/tenancy/constants';

export type RepairTicketLink =
  | { state: 'linked'; zendeskTicketId: number }
  | { state: 'none' }
  | { state: 'unverified'; ticketNumber: string }
  | { state: 'ambiguous'; zendeskTicketIds: number[] }
  | { state: 'internal'; supportTicketId: number };

export interface RepairTicketLinkRow {
  supportTicketId: number;
  zendeskTicketId: number | null;
}

/** A typed ticket number that could be a Zendesk id (`123` or `#123`), as a number. */
function zendeskNumberFrom(ticketNumber: string | null): number | null {
  const trimmed = ticketNumber?.trim() ?? '';
  if (!/^#?\d+$/.test(trimmed)) return null;
  const n = Number(trimmed.replace(/^#/, ''));
  return Number.isSafeInteger(n) ? n : null;
}

export function classifyRepairTicketLink(
  rows: ReadonlyArray<RepairTicketLinkRow>,
  ticketNumber: string | null,
): RepairTicketLink {
  // One entry per support ticket; a ticket keeps its Zendesk id if any row carries it.
  const tickets = new Map<number, number | null>();
  for (const row of rows) {
    const known = tickets.get(row.supportTicketId) ?? null;
    tickets.set(row.supportTicketId, known ?? row.zendeskTicketId);
  }

  const typed = zendeskNumberFrom(ticketNumber);

  if (tickets.size === 0) {
    return typed !== null
      ? { state: 'unverified', ticketNumber: ticketNumber!.trim() }
      : { state: 'none' };
  }

  if (tickets.size > 1) {
    const ids = [...new Set([...tickets.values()].filter((id): id is number => id !== null))];
    return { state: 'ambiguous', zendeskTicketIds: ids };
  }

  const [[supportTicketId, zendeskTicketId]] = tickets;
  if (zendeskTicketId === null) return { state: 'internal', supportTicketId };
  if (typed !== null && typed !== zendeskTicketId) {
    return { state: 'ambiguous', zendeskTicketIds: [zendeskTicketId, typed] };
  }
  return { state: 'linked', zendeskTicketId };
}

/** Read and classify a repair's ticket linkage; null when the repair does not exist in the org. */
export async function readRepairTicketLink(
  orgId: OrgId,
  repairId: number,
): Promise<RepairTicketLink | null> {
  // Lazy, not static: `@/lib/db` is `server-only` and opens a pool at load, which
  // would make the pure classifier above un-importable from its unit test.
  const { tenantQuery } = await import('@/lib/tenancy/db');
  const [repair, links] = await Promise.all([
    tenantQuery<{ ticket_number: string | null }>(
      orgId,
      `SELECT ticket_number FROM repair_service WHERE id = $2 AND organization_id = $1`,
      [orgId, repairId],
    ),
    tenantQuery<{ support_ticket_id: string | number; zendesk_ticket_id: string | number | null }>(
      orgId,
      `SELECT support_ticket_id, zendesk_ticket_id
         FROM ticket_links
        WHERE organization_id = $1 AND entity_type = 'REPAIR' AND entity_id = $2`,
      [orgId, repairId],
    ),
  ]);
  if (repair.rows.length === 0) return null;

  return classifyRepairTicketLink(
    links.rows.map((row) => ({
      supportTicketId: Number(row.support_ticket_id),
      zendeskTicketId: row.zendesk_ticket_id === null ? null : Number(row.zendesk_ticket_id),
    })),
    repair.rows[0].ticket_number,
  );
}
