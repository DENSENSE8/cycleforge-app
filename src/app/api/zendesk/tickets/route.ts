import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, errorResponse } from '@/lib/api';
import { withAuth } from '@/lib/auth/withAuth';
import { ZendeskApiError, ZendeskNotConfiguredError } from '@/lib/zendesk';
import {
  getHelpdeskProvider,
  HELPDESK_CONNECT_HINT,
  HELPDESK_NOT_CONNECTED_MESSAGE,
} from '@/lib/integrations/helpdesk';
import { getIntegrationCredentials } from '@/lib/integrations/credentials';
import { buildExternalId, linkTicket } from '@/lib/zendesk-links';
import { pairTicketShipmentFromEntity } from '@/lib/support/ticket-link';

export const dynamic = 'force-dynamic';

/**
 * Helpdesk tickets collection (Zendesk is the first adapter).
 *
 *   GET  /api/zendesk/tickets            → list (paginated, newest first)
 *   GET  /api/zendesk/tickets?query=...  → helpdesk search
 *   POST /api/zendesk/tickets            → create
 *
 * Goes through the org's HelpdeskProvider (capability facade). Gated by
 * integrations.zendesk.
 */

function notConfigured(context: string): NextResponse {
  return errorResponse(
    new ApiError(503, HELPDESK_NOT_CONNECTED_MESSAGE, HELPDESK_CONNECT_HINT),
    context,
  );
}

/** Map a thrown Zendesk client error to a clean API response. */
function mapZendeskError(err: unknown, context: string): NextResponse {
  if (err instanceof ZendeskNotConfiguredError) return notConfigured(context);
  if (err instanceof ZendeskApiError) {
    // Surface Zendesk's own status (e.g. 422 validation) rather than a flat 500.
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return errorResponse(new ApiError(status, 'Zendesk API error', err.message), context);
  }
  return errorResponse(err, context);
}

const ListQuery = z.object({
  query: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'priority', 'status', 'id']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const GET = withAuth(
  async (req: NextRequest, ctx) => {
    const context = 'GET /api/zendesk/tickets';
    try {
      const helpdesk = await getHelpdeskProvider(ctx.organizationId);
      if (!helpdesk || !(await helpdesk.isConfigured())) return notConfigured(context);

      const sp = req.nextUrl.searchParams;
      const parsed = ListQuery.parse({
        query: sp.get('query') ?? undefined,
        page: sp.get('page') ?? undefined,
        perPage: sp.get('perPage') ?? sp.get('per_page') ?? undefined,
        sortBy: sp.get('sortBy') ?? sp.get('sort_by') ?? undefined,
        sortOrder: sp.get('sortOrder') ?? sp.get('sort_order') ?? undefined,
      });

      const creds = await getIntegrationCredentials<{ subdomain?: string | null }>(ctx.organizationId, 'zendesk');
      const subdomain = creds?.subdomain ?? process.env.ZENDESK_SUBDOMAIN ?? 'usav';

      if (parsed.query) {
        const { results, count, next_page } = await helpdesk.searchTickets(parsed.query, {
          page: parsed.page,
          perPage: parsed.perPage,
        });
        // Normalize the Search API shape (`results`) to the list shape (`tickets`)
        // the client reads. Without this, every status filter (which runs in
        // search mode) renders empty while only "All" (list mode) works.
        return NextResponse.json({
          success: true,
          mode: 'search',
          subdomain,
          tickets: results,
          count,
          next_page,
          previous_page: null,
        });
      }

      const result = await helpdesk.listTickets({
        page: parsed.page,
        perPage: parsed.perPage,
        sortBy: parsed.sortBy,
        sortOrder: parsed.sortOrder,
      });
      return NextResponse.json({ success: true, mode: 'list', subdomain, ...result });
    } catch (err) {
      return mapZendeskError(err, context);
    }
  },
  { permission: 'integrations.zendesk', feature: 'support' },
);

const CreateBody = z.object({
  subject: z.string().trim().min(1, 'subject is required'),
  body: z.string().trim().min(1, 'body is required'),
  html_body: z.string().optional(),
  public: z.boolean().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  status: z.enum(['new', 'open', 'pending', 'hold', 'solved', 'closed']).optional(),
  type: z.enum(['problem', 'incident', 'question', 'task']).optional(),
  tags: z.array(z.string()).optional(),
  requester: z
    .object({ name: z.string().optional(), email: z.string().email().optional() })
    .optional(),
  assignee_id: z.number().int().positive().optional(),
  group_id: z.number().int().positive().optional(),
  external_id: z.string().optional(),
  /** Optional internal entity to link the ticket to (powers Blob photos + cross-links). */
  entity: z
    .object({ type: z.string().min(1), id: z.number().int().positive() })
    .optional(),
});

export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    const context = 'POST /api/zendesk/tickets';
    try {
      const helpdesk = await getHelpdeskProvider(ctx.organizationId);
      if (!helpdesk || !(await helpdesk.isConfigured())) return notConfigured(context);

      const json = await req.json().catch(() => null);
      if (!json) throw ApiError.badRequest('Missing JSON body');
      const input = CreateBody.parse(json);

      // When an entity is supplied, stamp Zendesk's external_id so the ticket is
      // self-describing even before the ticket_links row is written.
      const externalId = input.entity
        ? buildExternalId(input.entity.type, input.entity.id)
        : input.external_id;

      const ticket = await helpdesk.createTicket({
        subject: input.subject,
        comment: { body: input.body, html_body: input.html_body, public: input.public },
        priority: input.priority,
        status: input.status,
        type: input.type,
        tags: input.tags,
        requester: input.requester,
        assignee_id: input.assignee_id,
        group_id: input.group_id,
        external_id: externalId,
      });

      // Best-effort link — never fail ticket creation if the mapping write fails.
      if (input.entity && ticket?.id) {
        try {
          await linkTicket({
            orgId: ctx.organizationId,
            zendeskTicketId: ticket.id,
            entityType: input.entity.type.toUpperCase(),
            entityId: input.entity.id,
            staffId: ctx.staffId,
          });
        } catch (linkErr) {
          console.warn('[POST /api/zendesk/tickets] linkTicket failed', linkErr);
        }
        try {
          await pairTicketShipmentFromEntity({
            orgId: ctx.organizationId,
            ticketId: ticket.id,
            entityType: input.entity.type,
            entityId: input.entity.id,
            staffId: ctx.staffId,
          });
        } catch (pairErr) {
          console.warn('[POST /api/zendesk/tickets] STN pair failed', pairErr);
        }
      }

      return NextResponse.json({ success: true, ticket }, { status: 201 });
    } catch (err) {
      return mapZendeskError(err, context);
    }
  },
  {
    permission: 'integrations.zendesk',
    feature: 'support',
    audit: {
      source: 'api',
      action: 'zendesk.ticket.create',
      entityType: 'zendesk_ticket',
      entityId: ({ response }) =>
        (response as { ticket?: { id?: number } } | null)?.ticket?.id ?? null,
    },
  },
);
