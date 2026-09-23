/**
 * The inbox's missing CREATE path — a directly-addressed row.
 *
 * `staff_inbox_items` shipped with `reason: 'manual' | 'acted' | 'assigned' |
 * 'mentioned' | 'rule' | 'sla'` in its CHECK and a renderer that reads
 * 'assigned' as "Assigned to you", but the only writer was
 * `drainNotificationOutbox` — so 'assigned' could never be written. This is
 * that writer.
 *
 * ## Why this bypasses the outbox, and why that is not a shortcut
 *
 * The pipeline is `ops_events → notification_outbox → cron worker →
 * staff_inbox_items`, and the worker's whole job is `resolveRecipients()`:
 * deriving WHO should hear about a domain event from `staff_subscriptions`.
 *
 * A thrown task has no recipient to derive. A colleague chose a person by name.
 * Routing it through the outbox would hand an explicit address to a resolver
 * whose only answer is "whoever subscribed" — and the assignee almost certainly
 * has not subscribed to that carton, so the row would be delivered to the wrong
 * people or to nobody. The cron delay (up to a batch interval) would also make
 * a bench handoff arrive late, which is the one thing it cannot do.
 *
 * So: derived recipients go through the outbox; explicit recipients are written
 * here. Same table, same read model, same triage verbs.
 */

import { WORK_TASK_ASSIGNED } from './event-vocabulary';

/**
 * Idempotency + collapse keys for a thrown task.
 *
 * BOTH are keyed on the task, and the collapse key deliberately so. The worker
 * collapses rows sharing a `collapse_key` within a 60s window, bumping
 * `collapse_count` and re-marking a read row unread. If a task's collapse key
 * were the entity's (`order:5:delivery`), an unrelated system notification
 * about that order could fold INTO a human handoff — one operator's message to
 * another silently absorbed into a machine event, or vice versa. Per-task keys
 * make a thrown task collapse with nothing, which is correct: two people
 * handing you the same carton for different reasons are two things to do.
 */
function assignedTaskKeys(workAssignmentId: number): {
  dedupKey: string;
  collapseKey: string;
} {
  const key = `task:${workAssignmentId}`;
  return { dedupKey: key, collapseKey: key };
}

interface AssignInboxItemArgs {
  staffId: number;
  entityType: string;
  entityId: number;
  workAssignmentId: number;
  /** NULL when the system assigned it (cron ingest) — the table and the inbox
   *  read model (`InboxItemDto.actorStaffId`) both already carry that state. */
  actorStaffId: number | null;
  /** Render hints only — never filtered on (the table's own contract). */
  note: string | null;
  urgent: boolean;
  /**
   * The PROVIDER ticket number, on a `support_ticket` row only.
   *
   * `entity_id` is the LOCAL `support_tickets.id` — what the row is anchored to
   * and what `?ticket=` resolves against. It is NOT the number an operator
   * quotes, and an inbox row reading `Ticket 461` next to a desk row reading
   * `Ticket 10023` is the two-numbers confusion in its most visible form. A
   * render hint, so the anchor stays the id the CHECK and the delete trigger
   * know about.
   */
  ticketNumber?: number | null;
}

/** The one statement, exposed so a test can assert what is bound to it. */
export const ASSIGN_INBOX_ITEM_SQL = `
  INSERT INTO staff_inbox_items
    (organization_id, staff_id, entity_type, entity_id, event_key, actor_staff_id,
     reason, payload, dedup_key, collapse_key, state, occurred_at, last_event_at)
  VALUES
    ($1, $2, $3, $4, $5, $6,
     'assigned', $7::jsonb, $8, $9, 'unread', NOW(), NOW())
  ON CONFLICT (organization_id, staff_id, dedup_key) DO NOTHING
  RETURNING id
`;

export function assignInboxItemParams(
  organizationId: string,
  args: AssignInboxItemArgs,
): unknown[] {
  const { dedupKey, collapseKey } = assignedTaskKeys(args.workAssignmentId);
  return [
    organizationId,
    args.staffId,
    args.entityType,
    args.entityId,
    WORK_TASK_ASSIGNED,
    args.actorStaffId,
    JSON.stringify({
      workAssignmentId: args.workAssignmentId,
      note: args.note,
      urgent: args.urgent,
      // Omitted rather than null on every non-ticket row — the payload is read
      // by `toItemDto`, and a key present on every row implies it means
      // something on every row.
      ...(args.ticketNumber != null ? { ticketNumber: args.ticketNumber } : {}),
    }),
    dedupKey,
    collapseKey,
  ];
}
