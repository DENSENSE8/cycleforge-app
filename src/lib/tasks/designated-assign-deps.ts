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

/**
 * Real bindings for the designated-tag ingest.
 *
 * ## Where the tags come from, and why it is the provider
 *
 * `support_tickets` mirrors provider, number, subject and status — not tags.
 * A designation is applied by an AGENT inside Zendesk, so the helpdesk is the
 * only place that knows about it; there is no local column to poll and adding
 * one would mean a mirror that is wrong between syncs. So the scan window is a
 * page of the provider's own ticket list.
 *
 * It is ordered by `updated_at DESC` on purpose: tagging a ticket bumps its
 * update timestamp, so a designation applied to a two-year-old ticket floats to
 * the top of the very next sweep. Ordering by `created_at` would make old
 * tickets undesignatable forever, which is precisely the case an agent reaches
 * for a tag to handle.
 *
 * One page per org per sweep — one API call, not one per ticket.
 */
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

    /**
     * PROVIDER number → LOCAL `support_tickets.id`, through the one translator.
     *
     * `fetchProviderTicket` answers from the ticket we ALREADY pulled in the
     * scan rather than re-fetching it: the resolver's contract is "ask the
     * helpdesk before minting a mirror", and this ticket came from the helpdesk
     * seconds ago. The `getTicket` fallback covers the one case the page cannot
     * answer — a ticket whose id the page listed but whose body it did not.
     */
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

    /**
     * The dedupe predicate. CANCELED is excluded so an operator who cancelled a
     * mis-designated task gets it re-created once the tag is corrected — and
     * DONE is NOT excluded, because a finished ticket must not sprout a fresh
     * task on every sweep for the rest of its life.
     */
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

    /**
     * `actorStaffId: null` — the system threw this one. A cron has no thrower,
     * and naming a real person as the assigner would put a lie in the audit and
     * in the assignee's inbox ("Michael assigned you this" when Michael did
     * not).
     */
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
