/**
 * Tagged ticket → assigned task, with no human in the middle.
 *
 * A helpdesk agent tags `designated_michael` and expects the ticket to appear
 * on Michael's list. Today it appears nowhere: somebody has to read the tag,
 * open the task composer, retype the ticket number and pick the person. This
 * pass is that somebody.
 *
 * ## It creates a task; it does not create a second task store
 *
 * Every assignment goes through `createTask` — the same path `POST /api/tasks`
 * uses — so the ingested task gets the identical inbox row, urgency promotion
 * and audit as one a colleague threw by hand. A direct INSERT into
 * `work_assignments` would produce a row that looks the same in the table and
 * behaves differently everywhere else.
 *
 * ## Idempotency is a PREDICATE, not a marker
 *
 * The cron re-runs every 15 minutes and the tag stays on the ticket forever, so
 * "did I already do this?" is asked on every pass. It is answered by looking
 * for a live task on the ticket — {@link DesignatedAssignDeps.hasOpenTask},
 * bound to a non-CANCELED `FOLLOW_UP` row on
 * `(entity_type='SUPPORT_TICKET', entity_id)` — rather than by stamping a
 * "seen" flag somewhere. A predicate cannot drift from the thing it describes:
 * cancel the task and the ticket becomes assignable again, which is exactly
 * what an operator who cancelled it meant. A marker would have to be un-stamped
 * by hand, and nobody would.
 *
 * Deliberately per-TICKET and not per-(ticket, assignee): a ticket already
 * being worked must not sprout a second task because the tag was re-typed or a
 * second designation was added.
 *
 * Pure orchestration over an injected {@link DesignatedAssignDeps}, so the
 * branch table is a DB-free unit test. Real bindings live in
 * `designated-assign-deps.ts`.
 */

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

/**
 * What one org's pass did.
 *
 * `scanned` counts every ticket looked at, tagged or not. `skipped` counts
 * tickets that carried a designation and got no task — already assigned,
 * untranslatable, ambiguous, or refused. `ambiguous` is a SUBSET of `skipped`,
 * broken out because it is the only one an operator can fix (by disambiguating
 * the tag) rather than the expected steady state.
 */
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
