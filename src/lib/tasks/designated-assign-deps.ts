import 'server-only';

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getTicket, listTickets } from '@/lib/zendesk';
import { upsertSupportTicket } from '@/lib/support/tickets';

import { createTask } from './create-task';
import {
  resolveTicketTarget,
  type RegisteredTicket,
  type TicketTargetDeps,
} from './resolve-ticket-target';
import type { DesignatedAssignDeps, DesignatedTicket } from './designated-assign';
import type { DesignatedStaff } from './designated-tag';

/** Real bindings for the designated-tag ingest. */
export function designatedAssignDeps(
  organizationId: OrgId,
  opts: { limit?: number } = {},
): DesignatedAssignDeps {
  const perPage = Math.min(100, Math.max(1, Math.floor(opts.limit ?? 100)));

  return {
    async listStaff(): Promise<DesignatedStaff[]> {
      const res = await tenantQuery<{ id: number; name: string | null; email: string | null }>(
        organizationId,
        `SELECT id, name, email
           FROM staff
          WHERE organization_id = $1 AND active = true`,
        [organizationId],
      );
      return res.rows.map((row) => ({
        id: Number(row.id),
        name: row.name ?? '',
        email: row.email,
      }));
    },

    async listTickets(): Promise<DesignatedTicket[]> {
      const page = await listTickets(
        { perPage, sortBy: 'updated_at', sortOrder: 'desc' },
        organizationId,
      );
      return page.tickets.map((t) => ({
        providerTicketId: Number(t.id),
        subject: t.subject ?? null,
        status: typeof t.status === 'string' ? t.status : null,
        tags: Array.isArray(t.tags) ? t.tags : [],
      }));
    },

    /** PROVIDER number → LOCAL `support_tickets.id`, through the one translator. */
    async resolveSupportTicketId(ticket: DesignatedTicket): Promise<number | null> {
      const deps: TicketTargetDeps = {
        async findRegistered(providerTicketId) {
          const res = await tenantQuery<{
            id: string;
            subject_cache: string | null;
            status_cache: string | null;
          }>(
            organizationId,
            `SELECT id, subject_cache, status_cache
               FROM support_tickets
              WHERE organization_id = $1
                AND provider = 'zendesk'
                AND external_ticket_id = $2
              LIMIT 1`,
            [organizationId, String(providerTicketId)],
          );
          const row = res.rows[0];
          if (!row) return null;
          return {
            id: Number(row.id),
            providerTicketId,
            subject: row.subject_cache,
            status: row.status_cache,
          } satisfies RegisteredTicket;
        },

        async fetchProviderTicket(providerTicketId) {
          if (providerTicketId === ticket.providerTicketId) {
            return { subject: ticket.subject, status: ticket.status };
          }
          const live = await getTicket(providerTicketId, organizationId);
          if (!live) return null;
          return { subject: live.subject ?? null, status: live.status ?? null };
        },

        async register({ providerTicketId, subject, status }) {
          const row = await upsertSupportTicket({
            orgId: organizationId,
            provider: 'zendesk',
            externalTicketId: String(providerTicketId),
            subjectCache: subject,
            statusCache: status,
            // Nobody registered it — the sweep did. Same "not recorded" the
            // created_by column is nullable for.
            staffId: null,
          });
          return {
            id: row.id,
            providerTicketId,
            subject: row.subjectCache,
            status: row.statusCache,
          } satisfies RegisteredTicket;
        },
      };

      const result = await resolveTicketTarget(String(ticket.providerTicketId), deps);
      return result.ok ? result.supportTicketId : null;
    },

    /** The dedupe predicate. */
    async hasOpenTask(supportTicketId: number): Promise<boolean> {
      const res = await tenantQuery<{ one: number }>(
        organizationId,
        `SELECT 1 AS one
           FROM work_assignments
          WHERE organization_id = $1
            AND entity_type = 'SUPPORT_TICKET'::work_entity_type_enum
            AND entity_id = $2
            AND work_type = 'FOLLOW_UP'::work_type_enum
            AND status <> 'CANCELED'::assignment_status_enum
          LIMIT 1`,
        [organizationId, supportTicketId],
      );
      return res.rows.length > 0;
    },

    /** `actorStaffId: */
    async createTask({ supportTicketId, assigneeStaffId, note }): Promise<boolean> {
      const result = await createTask(organizationId, {
        entityType: 'support_ticket',
        entityId: supportTicketId,
        assigneeStaffId,
        note,
        urgency: 'normal',
        actorStaffId: null,
      });
      if (!result.ok) {
        console.warn(
          `[designated-assign] org ${organizationId} ticket ${supportTicketId}: ` +
            `throw refused (${result.reason})`,
        );
        return false;
      }
      return true;
    },
  };
}
