/** The inbox's missing CREATE path — a directly-addressed row. */

import { WORK_TASK_ASSIGNED } from './event-vocabulary';

/** Idempotency + collapse keys for a thrown task. */
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
  /** The PROVIDER ticket number, on a `support_ticket` row only. */
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

/** The @mention twin of `ASSIGN_INBOX_ITEM_SQL` — same row shape, reason 'mentioned'. */
export const MENTION_INBOX_ITEM_SQL = ASSIGN_INBOX_ITEM_SQL.replace("'assigned'", "'mentioned'");

interface MentionInboxItemArgs {
  staffId: number;
  entityType: string;
  entityId: number;
  eventKey: string;
  /** The mentioning row's id — one inbox row per (recipient, note). */
  sourceKey: string;
  actorStaffId: number | null;
  note: string | null;
}

export function mentionInboxItemParams(organizationId: string, args: MentionInboxItemArgs): unknown[] {
  const key = `mention:${args.sourceKey}`;
  return [
    organizationId,
    args.staffId,
    args.entityType,
    args.entityId,
    args.eventKey,
    args.actorStaffId,
    JSON.stringify({ note: args.note, urgent: false }),
    key,
    key,
  ];
}
