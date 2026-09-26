/** Ticket number → **the thing a task can point at**. */

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

/** `Ticket 48120`, with the subject underneath. */
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
