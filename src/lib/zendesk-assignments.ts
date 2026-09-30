/** In-website assignment of a Zendesk ticket to one of OUR staff — independent of the Zendesk-side `assignee_id`. */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

export interface TicketAssignment {
  ticketId: number;
  assignedStaffId: number;
  assignedStaffName: string;
  assignedBy: number | null;
  updatedAtMs: number;
}

/** Row (from {@link TICKET_ASSIGNMENT_SELECT}) → TicketAssignment. */
export function mapTicketAssignmentRow(row: Record<string, unknown>): TicketAssignment {
  return {
    ticketId: Number(row.zendesk_ticket_id),
    assignedStaffId: Number(row.assigned_staff_id),
    assignedStaffName: String(row.assigned_staff_name ?? `Staff #${row.assigned_staff_id}`),
    assignedBy: row.assigned_by == null ? null : Number(row.assigned_by),
    updatedAtMs: Number(row.updated_at_ms) || 0,
  };
}

/** The assignment projection — also embedded by the ticket mirror's one-trip read. */
export const TICKET_ASSIGNMENT_SELECT = `
  SELECT a.zendesk_ticket_id::bigint,
         a.assigned_staff_id::int,
         s.name AS assigned_staff_name,
         a.assigned_by::int,
         (EXTRACT(EPOCH FROM a.updated_at) * 1000)::bigint AS updated_at_ms
    FROM support_ticket_assignments a
    JOIN staff s ON s.id = a.assigned_staff_id`;

/** The current in-website assignment for a ticket, or null. */
export async function getTicketAssignment(
  organizationId: OrgId,
  ticketId: number,
): Promise<TicketAssignment | null> {
  const r = await tenantQuery(
    organizationId,
    `${TICKET_ASSIGNMENT_SELECT}
      WHERE a.organization_id = $1
        AND a.zendesk_ticket_id = $2
      LIMIT 1`,
    [organizationId, ticketId],
  );
  return r.rows[0] ? mapTicketAssignmentRow(r.rows[0]) : null;
}

/** Assign (or re-assign) a ticket to a staffer. Upserts on (org, ticket). */
export async function upsertTicketAssignment(args: {
  organizationId: OrgId;
  ticketId: number;
  staffId: number;
  assignedBy: number | null;
}): Promise<TicketAssignment> {
  const row = await withTenantTransaction(args.organizationId, async (client) => {
    await client.query(
      `INSERT INTO support_ticket_assignments
         (organization_id, zendesk_ticket_id, assigned_staff_id, assigned_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, zendesk_ticket_id)
       DO UPDATE SET assigned_staff_id = EXCLUDED.assigned_staff_id,
                     assigned_by       = EXCLUDED.assigned_by,
                     updated_at        = NOW()`,
      [args.organizationId, args.ticketId, args.staffId, args.assignedBy],
    );
    const read = await client.query(
      `${TICKET_ASSIGNMENT_SELECT}
        WHERE a.organization_id = $1
          AND a.zendesk_ticket_id = $2
        LIMIT 1`,
      [args.organizationId, args.ticketId],
    );
    return read.rows[0] ?? null;
  });
  if (!row) throw new Error('support_ticket_assignments upsert did not return a readable row');
  return mapTicketAssignmentRow(row);
}

/** Clear the in-website assignment for a ticket. */
export async function clearTicketAssignment(
  organizationId: OrgId,
  ticketId: number,
): Promise<void> {
  await tenantQuery(
    organizationId,
    `DELETE FROM support_ticket_assignments
      WHERE organization_id = $1 AND zendesk_ticket_id = $2`,
    [organizationId, ticketId],
  );
}

/** Open watches for one org — the ticket-watch cron's poll set. */
export async function listTicketAssignmentsForOrg(
  organizationId: OrgId,
  opts: { limit?: number } = {},
): Promise<TicketAssignment[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const r = await tenantQuery(
    organizationId,
    `${TICKET_ASSIGNMENT_SELECT}
      WHERE a.organization_id = $1
      ORDER BY a.updated_at DESC
      LIMIT ${limit}`,
    [organizationId],
  );
  return r.rows.map(mapTicketAssignmentRow);
}
