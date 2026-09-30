/** Zendesk adapter for the HelpdeskProvider facade — binds the existing per-tenant Zendesk client (src/lib/zendesk.ts) to one orgId. */
import type { OrgId } from '@/lib/tenancy/constants';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import type { HelpdeskProvider, HelpdeskTicket } from './types';

/** Lazy module loader — resolved once per process, per import graph. */
const zendesk = () => import('@/lib/zendesk');
/** Lazy: the mirror imports this facade's resolver, so a static import would cycle. */
const ticketMirror = () => import('@/lib/support/ticket-mirror');

export function createZendeskHelpdeskProvider(orgId: OrgId): HelpdeskProvider {
  /**
   * Write-through: every ticket write re-mirrors the ticket (ticket + full
   * thread) before returning, so the next local read already shows it.
   */
  const mirrored = async <T extends HelpdeskTicket | null>(ticket: T): Promise<T> => {
    if (ticket) await (await ticketMirror()).remirrorFetchedTicket(orgId, provider, ticket);
    return ticket;
  };

  const provider: HelpdeskProvider = {
    provider: 'zendesk',

    // isZendeskConfiguredForOrg already includes the dogfood env fallback.
    isConfigured: async () => (await zendesk()).isZendeskConfiguredForOrg(orgId),

    listTickets: async (params) => (await zendesk()).listTickets(params, orgId),

    searchTickets: async (query, params) => (await zendesk()).searchTickets(query, params, orgId),

    getTicket: async (id) => (await zendesk()).getTicket(id, orgId),

    createTicket: async (input, opts) =>
      mirrored(await (await zendesk()).createTicket(input, opts, orgId)),

    updateTicket: async (id, patch) =>
      mirrored(await (await zendesk()).updateTicket(id, patch, orgId)),

    deleteTicket: async (id) => {
      const deleted = await (await zendesk()).deleteTicket(id, orgId);
      if (deleted) await (await ticketMirror()).forgetTicketMirror(orgId, id);
      return deleted;
    },

    listComments: async (id, params) => (await zendesk()).listTicketComments(id, params, orgId),

    addComment: async (id, comment, opts) =>
      mirrored(await (await zendesk()).addTicketComment(id, comment, opts, orgId)),

    uploadAttachment: async (filename, bytes, contentType) =>
      (await zendesk()).uploadFileToZendesk(filename, bytes, contentType, orgId),

    listAgents: async (force) => (await zendesk()).listAgents(force, orgId),

    getUsers: async (ids) => (await zendesk()).getUsers(ids, orgId),

    getOverview: async (limit) => (await zendesk()).getZendeskSupportOverview(limit, orgId),

    // Env-only + sync — the one deliberate non-lazy dependency (client-safe lib).
    ticketUrl: (id) => zendeskTicketUrl(id),
  };
  return provider;
}
