/** Tagged ticket → assigned task, with no human in the middle. */

import { classifyDesignatedTags, type DesignatedStaff } from './designated-tag';

/** A provider ticket as this pass needs it. */
export interface DesignatedTicket {
  /** The PROVIDER number (`#48120`) — what the helpdesk and the tag live on. */
  providerTicketId: number;
  subject: string | null;
  status: string | null;
  tags: readonly string[];
}

export interface DesignatedAssignDeps {
  /** Assignable roster for this org. Bind to ACTIVE staff only. */
  listStaff(): Promise<DesignatedStaff[]>;
  /** The scan window: provider tickets with their tags, newest activity first. */
  listTickets(): Promise<DesignatedTicket[]>;
  /**
   * PROVIDER number → LOCAL `support_tickets.id` (minting the mirror when the
   * org has never linked the ticket). `null` when the translation refuses.
   * Bound to `resolveTicketTarget`, the one translator.
   */
  resolveSupportTicketId(ticket: DesignatedTicket): Promise<number | null>;
  /** True when a non-CANCELED FOLLOW_UP task already points at this ticket. */
  hasOpenTask(supportTicketId: number): Promise<boolean>;
  /** Bound to `createTask`. Returns false when the throw was refused. */
  createTask(args: {
    supportTicketId: number;
    assigneeStaffId: number;
    note: string | null;
  }): Promise<boolean>;
}

/** What one org's pass did. */
export interface DesignatedAssignSummary {
  scanned: number;
  assigned: number;
  skipped: number;
  ambiguous: number;
}

export async function runDesignatedAssign(
  orgId: string,
  deps: DesignatedAssignDeps,
): Promise<DesignatedAssignSummary> {
  const summary: DesignatedAssignSummary = { scanned: 0, assigned: 0, skipped: 0, ambiguous: 0 };

  const tickets = await deps.listTickets();
  if (tickets.length === 0) return summary;

  const staff = await deps.listStaff();

  // Two provider tickets can mirror onto one registry row (a merge upstream).
  // Without this, one pass would create two tasks for the same ticket — the
  // stored predicate only sees rows that are already committed.
  const assignedThisRun = new Set<number>();

  for (const ticket of tickets) {
    summary.scanned += 1;

    const verdict = classifyDesignatedTags(ticket.tags, staff);
    if (verdict.kind === 'none') continue;

    if (verdict.kind === 'ambiguous') {
      // The count alone cannot be acted on — an operator fixing a designation
      // needs the ticket and the tags that collided.
      console.warn(
        `[designated-assign] org ${orgId} ticket #${ticket.providerTicketId}: ` +
          `ambiguous designation ${verdict.tags.join(', ')}`,
      );
      summary.ambiguous += 1;
      summary.skipped += 1;
      continue;
    }

    const supportTicketId = await deps.resolveSupportTicketId(ticket);
    if (supportTicketId == null) {
      summary.skipped += 1;
      continue;
    }

    if (assignedThisRun.has(supportTicketId) || (await deps.hasOpenTask(supportTicketId))) {
      summary.skipped += 1;
      continue;
    }

    const subject = ticket.subject?.trim();
    const created = await deps.createTask({
      supportTicketId,
      assigneeStaffId: verdict.staffId,
      note: subject ? subject : null,
    });

    if (!created) {
      summary.skipped += 1;
      continue;
    }

    assignedThisRun.add(supportTicketId);
    summary.assigned += 1;
  }

  return summary;
}
