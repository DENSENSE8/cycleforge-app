/**
 * Generic support-ticket CREATE — the station-generic counterpart to the
 * receiving-anchored claim wizard (/api/receiving/zendesk-claim) and the
 * thread-anchored escalate path (threads/escalate.ts).
 *
 * Mints a live helpdesk ticket via the capability facade (never a direct vendor
 * import), then either links it to an anchor through the shared link waist
 * ({@link linkTicketToAnchor}) or just registers it in `support_tickets`. Because
 * it produces a PROVIDER ticket, the returned `providerTicketId` opens cleanly in
 * SupportTicketFocus (`?ticket=<providerTicketId>`) with no URL-key change.
 *
 * Deps-injected (default real impls) so unit tests run DB-free and without a live
 * helpdesk connector (.claude/rules/backend-patterns.md).
 */
import type { OrgId } from '@/lib/tenancy/constants';
import {
  linkTicketToAnchor,
  type TicketLinkAnchorInput,
} from '@/lib/support/ticket-link';

export interface CreateSupportTicketDeps {
  /** Create a live provider ticket via the helpdesk facade; returns its id + subject. */
  createProviderTicket: (args: {
    orgId: OrgId;
    subject: string;
    body: string;
    idempotencyKey?: string | null;
  }) => Promise<{ id: number; subject: string | null }>;
  /** Link the created ticket to an anchor (reuses the shared link waist). */
  linkAnchor: typeof linkTicketToAnchor;
  /** Register the provider ticket in the org registry when there is no anchor. */
  registerTicket: (args: {
    orgId: OrgId;
    providerTicketId: number;
    subjectCache: string | null;
    staffId?: number | null;
  }) => Promise<{ id: number }>;
}

interface CreateSupportTicketInput {
  orgId: OrgId;
  subject: string;
  /** First comment/body pushed to the created ticket (defaults to the subject). */
  note?: string | null;
  /** Optional entity to anchor the new ticket to (order / receiving / tracking / shipment). */
  anchor?: TicketLinkAnchorInput | null;
  staffId?: number | null;
  /** Dedupe retried submits — the facade caches an identical-key create. */
  idempotencyKey?: string | null;
}

interface CreateSupportTicketResult {
  supportTicketId: number;
  providerTicketId: number;
  subject: string | null;
  linkedEntityType: string | null;
  linkedEntityId: number | null;
}

const defaultCreateSupportTicketDeps: CreateSupportTicketDeps = {
  createProviderTicket: async ({ orgId, subject, body, idempotencyKey }) => {
    const { requireHelpdeskProvider } = await import('@/lib/integrations/helpdesk');
    const provider = await requireHelpdeskProvider(orgId);
    const ticket = await provider.createTicket(
      { subject, comment: { body } },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    return { id: ticket.id, subject: ticket.subject ?? null };
  },
  linkAnchor: linkTicketToAnchor,
  registerTicket: async ({ orgId, providerTicketId, subjectCache, staffId }) => {
    const { upsertSupportTicket } = await import('@/lib/support/tickets');
    const row = await upsertSupportTicket({
      orgId,
      provider: 'zendesk',
      externalTicketId: String(providerTicketId),
      subjectCache,
      staffId: staffId ?? null,
    });
    return { id: row.id };
  },
};

export async function createSupportTicket(
  input: CreateSupportTicketInput,
  deps: CreateSupportTicketDeps = defaultCreateSupportTicketDeps,
): Promise<CreateSupportTicketResult> {
  const subject = input.subject.trim() || 'Support ticket';
  const body = (input.note && input.note.trim()) || subject;

  const created = await deps.createProviderTicket({
    orgId: input.orgId,
    subject,
    body,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  if (input.anchor) {
    // Reuse the shared link waist: it upserts the support_tickets row, writes the
    // ticket_links anchor via linkSupportTicketEntity, backfills external_id, and
    // pairs the carton STN when relevant. Never re-implement that here.
    const linked = await deps.linkAnchor({
      orgId: input.orgId,
      ticketId: created.id,
      anchor: input.anchor,
      staffId: input.staffId ?? null,
    });
    return {
      supportTicketId: linked.supportTicketId,
      providerTicketId: created.id,
      subject: created.subject ?? subject,
      linkedEntityType: linked.entityType,
      linkedEntityId: linked.entityId,
    };
  }

  const registered = await deps.registerTicket({
    orgId: input.orgId,
    providerTicketId: created.id,
    subjectCache: created.subject ?? subject,
    staffId: input.staffId ?? null,
  });
  return {
    supportTicketId: registered.id,
    providerTicketId: created.id,
    subject: created.subject ?? subject,
    linkedEntityType: null,
    linkedEntityId: null,
  };
}
