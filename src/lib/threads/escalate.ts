/**
 * Escalate an entity thread to a support ticket (D6 — the attach seam).
 *
 * Two modes, both ending in `attachSupportTicket` (which sets
 * entity_threads.support_ticket_id, idempotent same-ticket / 409 different):
 *
 *   • 'internal' — the first real writer of the dead `provider='internal'`
 *     capability (src/lib/support/tickets.ts). Creates an internal
 *     support_tickets row and attaches it. Never touches ticket_links, so it
 *     sidesteps that table's NOT NULL zendesk_ticket_id — an internal ticket
 *     has no Zendesk id by definition.
 *   • 'zendesk' — creates a live helpdesk ticket via the capability facade
 *     (requireHelpdeskProvider → createTicket), then linkTicket() upserts the
 *     zendesk support_tickets row + the ticket_links polymorphic row, and we
 *     attach the resulting support ticket to the thread.
 *
 * Deps-injected (default real impls) so unit tests run DB-free and without a
 * live Zendesk connector (.claude/rules/backend-patterns.md).
 */

import { withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  attachSupportTicket,
  getThread,
  type ThreadsDeps,
} from './threads';
import type { EntityThread } from './types';

// NOTE: the helpdesk / support-ticket / zendesk-links modules are server-only,
// so they are lazily imported *inside* the default dep impls below — never at
// module top level. That keeps the pure `escalateThreadToTicket` orchestration
// import-safe for DB-free unit tests (which inject fakes and never hit these).

export type EscalateMode = 'internal' | 'zendesk';

export interface EscalateThreadInput {
  orgId: OrgId;
  threadId: number;
  mode: EscalateMode;
  /** Ticket subject (defaults to an entity-anchored line). */
  subject?: string | null;
  /** Optional first comment / note pushed to the created ticket. */
  note?: string | null;
  staffId?: number | null;
}

export interface EscalateThreadDeps {
  /** Resolve the thread by id (entity anchor + current ticket link). */
  loadThread: (orgId: OrgId, threadId: number) => Promise<EntityThread | null>;
  /** Create an internal support ticket; returns its registry id. */
  createInternalTicket: (args: {
    orgId: OrgId;
    subject: string;
    staffId?: number | null;
  }) => Promise<{ supportTicketId: number }>;
  /** Create a live helpdesk ticket + ticket_links row; returns the support id. */
  createZendeskTicket: (args: {
    orgId: OrgId;
    entityType: string;
    entityId: number;
    subject: string;
    note?: string | null;
    staffId?: number | null;
  }) => Promise<{ supportTicketId: number; externalTicketId: string }>;
  /** Attach the (internal or zendesk) support ticket to the thread. */
  attach: (args: {
    orgId: OrgId;
    threadId: number;
    supportTicketId: number;
  }) => ReturnType<typeof attachSupportTicket>;
}

export const defaultEscalateDeps: EscalateThreadDeps = {
  loadThread: (orgId, threadId) => getThread(orgId, threadId),
  createInternalTicket: async ({ orgId, subject, staffId }) => {
    const { upsertSupportTicket } = await import('@/lib/support/tickets');
    const ticket = await upsertSupportTicket({
      orgId,
      provider: 'internal',
      subjectCache: subject,
      staffId: staffId ?? null,
    });
    return { supportTicketId: ticket.id };
  },
  createZendeskTicket: async ({ orgId, entityType, entityId, subject, note, staffId }) => {
    const { requireHelpdeskProvider } = await import('@/lib/integrations/helpdesk');
    const { linkTicket } = await import('@/lib/zendesk-links');
    const provider = await requireHelpdeskProvider(orgId);
    const ticket = await provider.createTicket({
      subject,
      comment: { body: (note && note.trim()) || subject },
    });
    const { supportTicketId } = await linkTicket({
      orgId,
      zendeskTicketId: ticket.id,
      entityType,
      entityId,
      staffId: staffId ?? null,
    });
    return { supportTicketId, externalTicketId: String(ticket.id) };
  },
  attach: (args) => attachSupportTicket(args),
};

export type EscalateThreadResult =
  | { ok: true; thread: EntityThread; supportTicketId: number; created: boolean; idempotent: boolean }
  | { ok: false; status: 400 | 404 | 409; error: string };

function defaultSubject(entityType: string, entityId: number): string {
  return `${entityType.replace(/_/g, ' ').toLowerCase()} #${entityId}`;
}

export async function escalateThreadToTicket(
  input: EscalateThreadInput,
  deps: EscalateThreadDeps = defaultEscalateDeps,
): Promise<EscalateThreadResult> {
  if (input.mode !== 'internal' && input.mode !== 'zendesk') {
    return { ok: false, status: 400, error: `unknown escalate mode "${input.mode}"` };
  }
  const thread = await deps.loadThread(input.orgId, input.threadId);
  if (!thread) {
    return { ok: false, status: 404, error: `thread ${input.threadId} not found` };
  }
  // Already escalated — idempotent no-op (never create a second ticket).
  if (thread.supportTicketId != null) {
    return {
      ok: true,
      thread,
      supportTicketId: thread.supportTicketId,
      created: false,
      idempotent: true,
    };
  }

  const subject = input.subject?.trim() || defaultSubject(thread.entityType, thread.entityId);

  const { supportTicketId } =
    input.mode === 'internal'
      ? await deps.createInternalTicket({ orgId: input.orgId, subject, staffId: input.staffId })
      : await deps.createZendeskTicket({
          orgId: input.orgId,
          entityType: thread.entityType,
          entityId: thread.entityId,
          subject,
          note: input.note,
          staffId: input.staffId,
        });

  const attached = await deps.attach({
    orgId: input.orgId,
    threadId: input.threadId,
    supportTicketId,
  });
  if (!attached.ok) return attached;

  return {
    ok: true,
    thread: attached.thread,
    supportTicketId,
    created: true,
    idempotent: attached.idempotent,
  };
}

/** Reverse lookup: the entity thread linked to a support ticket, if any. */
export async function resolveThreadForTicket(
  orgId: OrgId,
  supportTicketId: number,
  deps: Pick<ThreadsDeps, 'runQuery'> = { runQuery: (o, fn) => withTenantConnection(o, (c) => fn(c)) },
): Promise<EntityThread | null> {
  if (!Number.isSafeInteger(supportTicketId) || supportTicketId <= 0) return null;
  return deps.runQuery(orgId, async (client) => {
    const res = await client.query(
      `SELECT id, entity_type, entity_id, status, support_ticket_id, last_message_at,
              created_by, created_at, updated_at
         FROM entity_threads
        WHERE organization_id = $1::uuid AND support_ticket_id = $2::bigint
        LIMIT 1`,
      [orgId, supportTicketId],
    );
    if (!res.rows.length) return null;
    const row = res.rows[0];
    return {
      id: Number(row.id),
      entityType: String(row.entity_type),
      entityId: Number(row.entity_id),
      status: row.status as EntityThread['status'],
      supportTicketId: row.support_ticket_id == null ? null : Number(row.support_ticket_id),
      lastMessageAt:
        row.last_message_at == null
          ? null
          : row.last_message_at instanceof Date
            ? row.last_message_at.toISOString()
            : String(row.last_message_at),
      createdBy: row.created_by == null ? null : Number(row.created_by),
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt:
        row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  });
}
