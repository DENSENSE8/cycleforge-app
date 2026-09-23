/**
 * Ticket number → **the thing a task can point at**.
 *
 * The Daily agenda's composer offers three types — *Daily checklist*, *Task*,
 * *Ticket* — and the third one has to answer a question the scan resolver
 * cannot. `POST /api/scan/resolve` decodes what this app PRINTS (carton
 * stickers, tracking, order handles) and {@link resolveThrowTargets} reads
 * cartons and orders back out of it. A helpdesk ticket is neither: the operator
 * quotes `#48120`, a number this app does not mint and cannot decode.
 *
 * ## Two numbers, and only one of them may be stored
 *
 * `#48120` is the PROVIDER number. `work_assignments.entity_id` must be the
 * LOCAL `support_tickets.id` — migration `2026-08-08a` says the enum arm "keys
 * on the LOCAL support_tickets.id … never a bare Zendesk id", and
 * `2026-08-08b` hangs a delete trigger on that parent. So this module's whole
 * job is the translation, and it refuses rather than guessing: a task anchored
 * to a number that is not a registry row would be a dangling polymorphic
 * parent the schema cannot catch.
 *
 * ## Registering the mirror is not creating a ticket
 *
 * A ticket the workspace has never linked has no `support_tickets` row yet. We
 * do NOT invent one from the typed digits: {@link TicketTargetDeps.fetchProviderTicket}
 * asks the helpdesk first, and only a ticket the provider confirms gets a
 * mirror through `upsertSupportTicket` — the same registry write every link
 * path already uses. A typo resolves to `not_found`, never to a fresh row.
 *
 * Pure orchestration with an injected `Deps`, so the branch table above is a
 * DB-free unit test rather than something a bench discovers.
 */

import { parseTicketScanValue } from '@/lib/support/ticket-scan';
import type { ThrowTarget } from './throw-targets';

/** A registry row, as this module needs it. */
export interface RegisteredTicket {
  /** `support_tickets.id` — what the task stores. */
  id: number;
  /** `external_ticket_id` as a number — what the operator quoted. */
  providerTicketId: number;
  subject: string | null;
  status: string | null;
}

export interface TicketTargetDeps {
  /** Registry lookup by PROVIDER number. `null` when this org has no mirror. */
  findRegistered: (providerTicketId: number) => Promise<RegisteredTicket | null>;
  /**
   * Live helpdesk read. `null` when the provider has no such ticket; THROWS
   * when the helpdesk is unreachable or disconnected, which is a different
   * answer from "that ticket does not exist".
   */
  fetchProviderTicket: (
    providerTicketId: number,
  ) => Promise<{ subject: string | null; status: string | null } | null>;
  /** Mint the org's mirror for a provider-confirmed ticket. */
  register: (args: {
    providerTicketId: number;
    subject: string | null;
    status: string | null;
  }) => Promise<RegisteredTicket>;
}

export type ResolveTicketTargetResult =
  | {
      ok: true;
      target: ThrowTarget;
      /** True when this call minted the registry mirror. Audited by the route. */
      registered: boolean;
      supportTicketId: number;
      providerTicketId: number;
    }
  | { ok: false; reason: 'invalid_number' | 'not_found' | 'helpdesk_unavailable' };

/**
 * `Ticket 48120`, with the subject underneath.
 *
 * The label deliberately matches `taskDeskRecordLabel`'s ticket face, so the
 * row the operator picks in the composer reads the same as the row that lands
 * in the agenda a second later.
 */
function ticketThrowTarget(ticket: RegisteredTicket): ThrowTarget {
  const subject = ticket.subject?.trim();
  return {
    entityType: 'support_ticket',
    entityId: ticket.id,
    label: `Ticket ${ticket.providerTicketId}`,
    ...(subject ? { sublabel: subject } : {}),
  };
}

export async function resolveTicketTarget(
  raw: string,
  deps: TicketTargetDeps,
): Promise<ResolveTicketTargetResult> {
  const providerTicketId = parseTicketScanValue(raw);
  if (providerTicketId == null) return { ok: false, reason: 'invalid_number' };

  const existing = await deps.findRegistered(providerTicketId);
  if (existing) {
    return {
      ok: true,
      target: ticketThrowTarget(existing),
      registered: false,
      supportTicketId: existing.id,
      providerTicketId,
    };
  }

  let live: { subject: string | null; status: string | null } | null;
  try {
    live = await deps.fetchProviderTicket(providerTicketId);
  } catch {
    // A helpdesk that is down must not read as "no such ticket" — the operator
    // would retype a correct number and get the same wrong answer.
    return { ok: false, reason: 'helpdesk_unavailable' };
  }
  if (!live) return { ok: false, reason: 'not_found' };

  const minted = await deps.register({
    providerTicketId,
    subject: live.subject,
    status: live.status,
  });
  return {
    ok: true,
    target: ticketThrowTarget(minted),
    registered: true,
    supportTicketId: minted.id,
    providerTicketId,
  };
}
