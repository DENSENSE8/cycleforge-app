/** Zendesk adapter for the HelpdeskProvider facade — binds the existing per-tenant Zendesk client (src/lib/zendesk.ts) to one orgId. */
import type { OrgId } from '@/lib/tenancy/constants';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import type { HelpdeskProvider } from './types';

/** Lazy module loader — resolved once per process, per import graph. */
const zendesk = () => import('@/lib/zendesk');

export function createZendeskHelpdeskProvider(orgId: OrgId): HelpdeskProvider {
  return {
    provider: 'zendesk',

    // isZendeskConfiguredForOrg already includes the dogfood env fallback.
    isConfigured: async () => (await zendesk()).isZendeskConfiguredForOrg(orgId),

    listTickets: async (params) => (await zendesk()).listTickets(params, orgId),

    searchTickets: async (query, params) => (await zendesk()).searchTickets(query, params, orgId),

    getTicket: async (id) => (await zendesk()).getTicket(id, orgId),

    createTicket: async (input, opts) => (await zendesk()).createTicket(input, opts, orgId),

    updateTicket: async (id, patch) => (await zendesk()).updateTicket(id, patch, orgId),

    deleteTicket: async (id) => (await zendesk()).deleteTicket(id, orgId),

    listComments: async (id, params) => (await zendesk()).listTicketComments(id, params, orgId),

    addComment: async (id, comment, opts) =>
      (await zendesk()).addTicketComment(id, comment, opts, orgId),

    uploadAttachment: async (filename, bytes, contentType) =>
      (await zendesk()).uploadFileToZendesk(filename, bytes, contentType, orgId),

    listAgents: async (force) => (await zendesk()).listAgents(force, orgId),

    getUsers: async (ids) => (await zendesk()).getUsers(ids, orgId),

    getOverview: async (limit) => (await zendesk()).getZendeskSupportOverview(limit, orgId),

    // Env-only + sync — the one deliberate non-lazy dependency (client-safe lib).
    ticketUrl: (id) => zendeskTicketUrl(id),
  };
}
