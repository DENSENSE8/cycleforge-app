import 'server-only';

/** Real bindings for {@link resolveTicketTarget} — the org's `support_tickets` registry, the live helpdesk, and the registry write every… */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { upsertSupportTicket } from '@/lib/support/tickets';
import { getTicket } from '@/lib/zendesk';
import type { RegisteredTicket, TicketTargetDeps } from './resolve-ticket-target';

export function ticketTargetDbDeps(orgId: OrgId, staffId: number | null): TicketTargetDeps {
  return {
    async findRegistered(providerTicketId) {
      const res = await tenantQuery<{
        id: string;
        external_ticket_id: string | null;
        subject_cache: string | null;
        status_cache: string | null;
      }>(
        orgId,
        `SELECT id, external_ticket_id, subject_cache, status_cache
           FROM support_tickets
          WHERE organization_id = $1
            AND provider = 'zendesk'
            AND external_ticket_id = $2
          LIMIT 1`,
        [orgId, String(providerTicketId)],
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
      const ticket = await getTicket(providerTicketId, orgId);
      if (!ticket) return null;
      return { subject: ticket.subject ?? null, status: ticket.status ?? null };
    },

    async register({ providerTicketId, subject, status }) {
      const row = await upsertSupportTicket({
        orgId,
        provider: 'zendesk',
        externalTicketId: String(providerTicketId),
        subjectCache: subject,
        statusCache: status,
        staffId,
      });
      return {
        id: row.id,
        providerTicketId,
        subject: row.subjectCache,
        status: row.statusCache,
      } satisfies RegisteredTicket;
    },
  };
}
