/** Generic support-ticket CREATE — the station-generic counterpart to the receiving-anchored claim wizard (/api/receiving/zendesk-claim)… */
import type { OrgId } from '@/lib/tenancy/constants';
import type { OrderLinkage, OrderLinkageInput } from '@/lib/order-linkage';
import type {
  LinkTicketToAnchorResult,
  TicketLinkAnchorInput,
} from '@/lib/support/ticket-link';
import {
  hasSupportTicketLinkages,
  pickAnchorFromLinkage,
  type SupportTicketLinkages,
} from '@/lib/support/create-ticket-linkages';

type AddShipmentReference = (args: {
  orgId: OrgId;
  ticketId: number;
  shipmentId?: number;
  trackingNumber?: string;
  staffId?: number | null;
}) => Promise<{ shipmentId: number; isPrimary: boolean; added: boolean }>;

export interface CreateSupportTicketDeps {
  /** Create a live provider ticket via the helpdesk facade; returns its id + subject. */
  createProviderTicket: (args: {
    orgId: OrgId;
    subject: string;
    body: string;
    idempotencyKey?: string | null;
  }) => Promise<{ id: number; subject: string | null }>;
  /** Link the created ticket to an anchor (reuses the shared link waist). */
  linkAnchor: (args: {
    orgId: OrgId;
    ticketId: number;
    anchor: TicketLinkAnchorInput;
    staffId?: number | null;
  }) => Promise<LinkTicketToAnchorResult>;
  /** Register the provider ticket in the org registry when there is no anchor. */
  registerTicket: (args: {
    orgId: OrgId;
    providerTicketId: number;
    subjectCache: string | null;
    staffId?: number | null;
  }) => Promise<{ id: number }>;
  /** Closed-loop resolve for optional linkages (order / tracking / serial). */
  resolveLinkage?: (orgId: OrgId, input: OrderLinkageInput) => Promise<OrderLinkage>;
  /** Attach an extra STN reference after the primary anchor is linked. */
  addShipmentReference?: AddShipmentReference;
}

interface CreateSupportTicketInput {
  orgId: OrgId;
  subject: string;
  /** First comment/body pushed to the created ticket (defaults to the subject). */
  note?: string | null;
  /** Optional entity to anchor the new ticket to (order / receiving / tracking / shipment / repair). */
  anchor?: TicketLinkAnchorInput | null;
  /**
   * Operator-typed identifiers — resolved server-side and merged with `anchor`
   * via {@link pickAnchorFromLinkage}.
   */
  linkages?: SupportTicketLinkages | null;
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
  linkAnchor: async (args) => {
    const { linkTicketToAnchor } = await import('@/lib/support/ticket-link');
    return linkTicketToAnchor(args);
  },
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
  resolveLinkage: async (orgId, input) => {
    const { resolveOrderLinkage } = await import('@/lib/order-linkage');
    return resolveOrderLinkage(orgId, input);
  },
  addShipmentReference: async (args) => {
    const { addTicketShipmentReference } = await import('@/lib/support/ticket-link');
    return addTicketShipmentReference(args);
  },
};

/** Exactly what the helpdesk receives for a new ticket — the live create and the test-mode preview share it. */
export function providerTicketContent(subject: string, note: string | null | undefined): { subject: string; body: string } {
  const title = subject.trim() || 'Support ticket';
  return { subject: title, body: (note && note.trim()) || title };
}

export async function createSupportTicket(
  input: CreateSupportTicketInput,
  deps: CreateSupportTicketDeps = defaultCreateSupportTicketDeps,
): Promise<CreateSupportTicketResult> {
  const { subject, body } = providerTicketContent(input.subject, input.note);

  let resolved: OrderLinkage | null = null;
  if (hasSupportTicketLinkages(input.linkages) && deps.resolveLinkage) {
    resolved = await deps.resolveLinkage(input.orgId, {
      order: input.linkages?.order ?? null,
      tracking: input.linkages?.tracking ?? null,
      serial: input.linkages?.serial ?? null,
    });
  }

  const plan = pickAnchorFromLinkage({
    explicitAnchor: input.anchor ?? null,
    linkages: input.linkages ?? null,
    resolved,
  });

  const created = await deps.createProviderTicket({
    orgId: input.orgId,
    subject,
    body,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  const addRef = deps.addShipmentReference;

  if (plan.anchor) {
    // Reuse the shared link waist: it upserts the support_tickets row, writes the
    // ticket_links anchor via linkSupportTicketEntity, backfills external_id, and
    // pairs the carton STN when relevant. Never re-implement that here.
    const linked = await deps.linkAnchor({
      orgId: input.orgId,
      ticketId: created.id,
      anchor: plan.anchor,
      staffId: input.staffId ?? null,
    });

    if (addRef) {
      for (const trackingNumber of plan.extraTrackingRefs) {
        try {
          await addRef({
            orgId: input.orgId,
            ticketId: created.id,
            trackingNumber,
            staffId: input.staffId ?? null,
          });
        } catch (err) {
          // Extra refs are best-effort — the primary anchor already succeeded.
          console.warn('[createSupportTicket] extra tracking ref failed (non-fatal)', err);
        }
      }
    }

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

  // No primary anchor — still attach typed tracking refs when present.
  if (addRef) {
    for (const trackingNumber of plan.extraTrackingRefs) {
      try {
        await addRef({
          orgId: input.orgId,
          ticketId: created.id,
          trackingNumber,
          staffId: input.staffId ?? null,
        });
      } catch (err) {
        console.warn('[createSupportTicket] tracking ref without anchor failed (non-fatal)', err);
      }
    }
  }

  return {
    supportTicketId: registered.id,
    providerTicketId: created.id,
    subject: created.subject ?? subject,
    linkedEntityType: null,
    linkedEntityId: null,
  };
}
