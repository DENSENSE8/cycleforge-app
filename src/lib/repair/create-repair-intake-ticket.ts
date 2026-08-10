/**
 * createRepairIntakeTicket — org-scoped helpdesk create for repair intake.
 *
 * Parity with receiving claim create (`/api/receiving/zendesk-claim`):
 * `getHelpdeskProvider(orgId).createTicket` + `linkTicketToAnchor`, never a
 * bare Zendesk client call without org scope.
 *
 * Walk-in availability trade: failures must not block intake. When immediate
 * create fails (or no provider), enqueue `CREATE_TICKET` for the outbox drain.
 * Counter composition passes `ticketWork: 'skip'` because it owns the enqueue.
 */

import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';
import type { HelpdeskProvider } from '@/lib/integrations/helpdesk';
import { updateRepairField } from '@/lib/neon/repair-service-queries';
import { logger } from '@/lib/observability/logger';
import { linkTicketToAnchor } from '@/lib/support/ticket-link';
import {
  enqueueTicketWork,
  type EnqueueTicketWorkArgs,
} from '@/lib/support/ticket-outbox';
import type { OrgId } from '@/lib/tenancy/constants';
import { addBusinessDays } from '@/lib/zendesk';

/** Default `'create'`; counter passes `'skip'` to avoid a second ticket. */
export type RepairIntakeTicketWork = 'create' | 'skip';

export interface CreateRepairIntakeTicketInput {
  orgId: OrgId;
  repairServiceId: number;
  repairServiceNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  productTitle: string;
  contactInfo: string;
  issue: string;
  serialNumber: string;
  price: string;
  notes: string;
  idempotencyKey?: string;
  ticketWork?: RepairIntakeTicketWork;
}

interface CreateRepairIntakeTicketResult {
  zendeskTicketNumber: string | null;
  ticketWarning: string | null;
}

export interface CreateRepairIntakeTicketDeps {
  getHelpdesk: (orgId: OrgId) => Promise<HelpdeskProvider | null>;
  stampTicketNumber: (
    repairId: number,
    ticketNumber: string,
    orgId: OrgId,
  ) => Promise<void>;
  linkAnchor: (args: {
    orgId: OrgId;
    ticketId: number;
    repairId: number;
  }) => Promise<void>;
  enqueue: (
    args: EnqueueTicketWorkArgs,
  ) => Promise<{ outboxId: number | null; queued: boolean }>;
}

const defaultDeps: CreateRepairIntakeTicketDeps = {
  getHelpdesk: getHelpdeskProvider,
  stampTicketNumber: async (repairId, ticketNumber, orgId) => {
    await updateRepairField(repairId, 'ticket_number', ticketNumber, orgId);
  },
  linkAnchor: async ({ orgId, ticketId, repairId }) => {
    await linkTicketToAnchor({
      orgId,
      ticketId,
      anchor: { type: 'repair', repairId },
    });
  },
  enqueue: enqueueTicketWork,
};

/** MM/DD/YYYY due date — same display format as the legacy createZendeskTicket body. */
export function formatRepairDueDate(startDate: Date = new Date()): string {
  const date = addBusinessDays(startDate, 5);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}/${date.getFullYear()}`;
}

export function buildRepairIntakeTicketPayload(
  input: Omit<CreateRepairIntakeTicketInput, 'orgId' | 'ticketWork' | 'idempotencyKey'>,
  dueDate: string = formatRepairDueDate(),
): { subject: string; body: string; tags: string[] } {
  const descriptionLines = [
    `Repair Service ${input.repairServiceNumber} (ID ${input.repairServiceId})`,
    '',
    `Product: ${input.productTitle}`,
    `Serial Number: ${input.serialNumber}`,
    `Reported Issue: ${input.issue}`,
    '',
    `Customer Contact: ${input.contactInfo}`,
    `Estimated Due Date: ${dueDate}`,
  ];
  if (input.notes) {
    descriptionLines.push('', 'Additional Notes:', input.notes);
  }

  return {
    subject: `Repair RS ${input.repairServiceId}: Walk-in ${input.customerName} - ${input.customerPhone} - Due Date: ${dueDate}`,
    body: descriptionLines.join('\n'),
    tags: ['repair_service', 'walk_in'],
  };
}

export async function createRepairIntakeTicket(
  input: CreateRepairIntakeTicketInput,
  deps: CreateRepairIntakeTicketDeps = defaultDeps,
): Promise<CreateRepairIntakeTicketResult> {
  if (input.ticketWork === 'skip') {
    return { zendeskTicketNumber: null, ticketWarning: null };
  }

  const { subject, body, tags } = buildRepairIntakeTicketPayload(input);
  const email = input.customerEmail.trim();

  try {
    const helpdesk = await deps.getHelpdesk(input.orgId);
    if (!helpdesk) {
      const queued = await deps.enqueue({
        orgId: input.orgId,
        workType: 'CREATE_TICKET',
        entityType: 'REPAIR',
        entityId: input.repairServiceId,
        payload: {
          subject,
          body,
          requesterName: input.customerName,
          requesterEmail: email || null,
          tags,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
      return {
        zendeskTicketNumber: null,
        ticketWarning: queued.queued
          ? 'Helpdesk is not connected — ticket queued for retry.'
          : 'Helpdesk is not connected — ticket was not created.',
      };
    }

    const ticket = await helpdesk.createTicket(
      {
        subject,
        comment: { body, public: false },
        type: 'task',
        tags,
        external_id: `repair:${input.repairServiceId}`,
        ...(email
          ? { requester: { name: input.customerName, email } }
          : {}),
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    );

    const ticketNumber = `#${ticket.id}`;
    await deps.stampTicketNumber(input.repairServiceId, ticketNumber, input.orgId);
    try {
      await deps.linkAnchor({
        orgId: input.orgId,
        ticketId: ticket.id,
        repairId: input.repairServiceId,
      });
    } catch (linkErr) {
      // Ticket exists and is stamped — link is best-effort so intake still succeeds.
      console.error('Failed to link repair intake ticket:', linkErr);
    }

    logger.info(`Helpdesk ticket created for repair: ${ticketNumber}`);
    return { zendeskTicketNumber: ticketNumber, ticketWarning: null };
  } catch (error: unknown) {
    console.error('Failed to create repair helpdesk ticket:', error);
    const queued = await deps.enqueue({
      orgId: input.orgId,
      workType: 'CREATE_TICKET',
      entityType: 'REPAIR',
      entityId: input.repairServiceId,
      payload: {
        subject,
        body,
        requesterName: input.customerName,
        requesterEmail: email || null,
        tags,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    return {
      zendeskTicketNumber: null,
      ticketWarning: queued.queued
        ? 'Helpdesk create failed — ticket queued for retry.'
        : 'Helpdesk create failed — ticket was not created.',
    };
  }
}
