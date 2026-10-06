/**
 * The per-order check-in projection (`order_support_follow_ups`) as the
 * Support item drives it. `refreshOrderCheckInForItem` re-derives the state
 * from the item's local truth (lifecycle, thread messages, the primary
 * task's follow-up log and date — see state.ts) every time the loop touches
 * a check-in item, inside the caller's transaction; nothing here ever
 * guesses a contact from elapsed time.
 */
import type { PoolClient } from 'pg';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type {
  CheckInOutcome,
  DeliveryState,
  OrderCheckInState,
  OrderCheckInTrigger,
  OrderCheckInView,
  SupportLifecycle,
} from '@/lib/support/conversation/model';
import { SUPPORT_CHECK_IN_PROGRAM } from './config';
import {
  deriveOrderCheckInState,
  storedCheckInClosure,
  type CheckInFollowUpFact,
  type CheckInMessageFact,
} from './state';

type Queryable = Pick<PoolClient, 'query'>;

interface ProjectionRow {
  id: string | number;
  order_id: number;
  order_number: string | null;
  state: OrderCheckInState;
  trigger_kind: OrderCheckInTrigger | null;
  trigger_at: Date | string | null;
  due_at: Date | string | null;
  support_ticket_id: string | number | null;
  assignment_id: number | null;
  contacted_at: Date | string | null;
  contact_message_id: string | number | null;
  contact_follow_up_id: string | number | null;
  latest_inbound_message_id: string | number | null;
  next_follow_up_at: Date | string | null;
  chase_count: number;
  disposition: string | null;
  disposition_reason: string | null;
  /** CHECK-constrained to CHECK_IN_OUTCOMES (2026-10-05_check_in_outcome.sql). */
  outcome: CheckInOutcome | null;
  closed_at: Date | string | null;
  closed_by_staff_id: number | null;
  closed_by_name: string | null;
}

const PROJECTION_VIEW_SELECT = `
  SELECT f.id, f.order_id, o.order_id AS order_number, f.state, f.trigger_kind, f.trigger_at, f.due_at,
         f.support_ticket_id, f.assignment_id, f.contacted_at, f.contact_message_id, f.contact_follow_up_id,
         f.latest_inbound_message_id, f.next_follow_up_at, f.chase_count, f.disposition, f.disposition_reason,
         f.outcome, f.closed_at, f.closed_by_staff_id, s.name AS closed_by_name
    FROM order_support_follow_ups f
    LEFT JOIN orders o ON o.id = f.order_id AND o.organization_id = f.organization_id
    LEFT JOIN staff s ON s.id = f.closed_by_staff_id AND s.organization_id = f.organization_id`;

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  const ms = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};
const toMs = (v: Date | string | null): number | null => {
  const iso = toIso(v);
  return iso == null ? null : Date.parse(iso);
};
const toId = (v: string | number | null): number | null => (v == null ? null : Number(v));

function checkInViewFromRow(row: ProjectionRow): OrderCheckInView {
  return {
    orderId: Number(row.order_id),
    orderNumber: row.order_number ?? null,
    state: row.state,
    triggerKind: row.trigger_kind ?? null,
    triggerAt: toIso(row.trigger_at),
    dueAt: toIso(row.due_at),
    supportItemId: toId(row.support_ticket_id),
    taskId: row.assignment_id != null ? Number(row.assignment_id) : null,
    contactedAt: toIso(row.contacted_at),
    contactMessageId: toId(row.contact_message_id),
    contactFollowUpId: toId(row.contact_follow_up_id),
    latestInboundMessageId: toId(row.latest_inbound_message_id),
    nextFollowUpAt: toIso(row.next_follow_up_at),
    chaseCount: Number(row.chase_count ?? 0),
    disposition: row.disposition ?? null,
    dispositionReason: row.disposition_reason ?? null,
    outcome: row.outcome ?? null,
    closedAt: toIso(row.closed_at),
    closedBy:
      row.closed_by_staff_id != null
        ? { id: Number(row.closed_by_staff_id), name: row.closed_by_name ?? `Staff #${row.closed_by_staff_id}` }
        : null,
  };
}

/**
 * The representative `orders.id` (lowest line id of the same order number +
 * storefront; see order-facts.ts) for any line of an order.
 */
export const REPRESENTATIVE_ORDER_ID_SQL = `
  SELECT MIN(o2.id) AS id
    FROM orders o
    JOIN orders o2
      ON o2.organization_id = o.organization_id
     AND (
           o2.id = o.id
        OR (NULLIF(btrim(o.order_id), '') IS NOT NULL
            AND o2.order_id = o.order_id
            AND COALESCE(o2.account_source, '') = COALESCE(o.account_source, ''))
     )
   WHERE o.organization_id = $1
     AND o.id = $2`;

async function representativeOrderId(q: Queryable, orgId: OrgId, orderId: number): Promise<number | null> {
  const res = await q.query<{ id: number | null }>(REPRESENTATIVE_ORDER_ID_SQL, [orgId, orderId]);
  const id = res.rows[0]?.id;
  return id != null ? Number(id) : null;
}

async function readView(q: Queryable, orgId: OrgId, projectionId: number): Promise<OrderCheckInView | null> {
  const res = await q.query<ProjectionRow>(
    `${PROJECTION_VIEW_SELECT} WHERE f.organization_id = $1 AND f.id = $2`,
    [orgId, projectionId],
  );
  return res.rows[0] ? checkInViewFromRow(res.rows[0]) : null;
}

interface ItemRow {
  kind: string;
  primary_order_id: number | null;
  primary_task_id: number | null;
  lifecycle: SupportLifecycle;
  resolved_at: Date | string | null;
  resolved_by_staff_id: number | null;
}

interface LockedRow {
  id: string | number;
  support_ticket_id: string | number | null;
  due_at: Date | string | null;
  disposition: string | null;
  disposition_reason: string | null;
  outcome: string | null;
  closed_at: Date | string | null;
  closed_by_staff_id: number | null;
}

/**
 * Recompute the check-in for a Support item, in the caller's transaction.
 * Null for an item that is not a post-purchase check-in (or has no order).
 * Links the projection row to the item and its primary task, and — when the
 * check-in waits on a silent customer and the task carries no follow-up date
 * — stamps the default chase date on the task so the follow-up-due sweep
 * alerts its owners. A staff-set task date is never overwritten.
 */
export async function refreshOrderCheckInForItem(
  client: PoolClient,
  args: { orgId: OrgId; supportItemId: number; staffId: number | null; nowMs: number },
): Promise<OrderCheckInView | null> {
  const { orgId, supportItemId, staffId, nowMs } = args;
  const itemRes = await client.query<ItemRow>(
    `SELECT kind, primary_order_id, primary_task_id, lifecycle, resolved_at, resolved_by_staff_id
       FROM support_tickets
      WHERE organization_id = $1 AND id = $2`,
    [orgId, supportItemId],
  );
  const item = itemRes.rows[0];
  if (!item || item.kind !== 'post_purchase_check_in' || item.primary_order_id == null) return null;

  const orderId = await representativeOrderId(client, orgId, Number(item.primary_order_id));
  if (orderId == null) return null;

  let rowRes = await client.query<LockedRow>(
    `SELECT id, support_ticket_id, due_at, disposition, disposition_reason, outcome, closed_at, closed_by_staff_id
       FROM order_support_follow_ups
      WHERE organization_id = $1
        AND program = $2
        AND (support_ticket_id = $3 OR order_id = $4)
      ORDER BY (support_ticket_id = $3) DESC NULLS LAST
      LIMIT 1
      FOR UPDATE`,
    [orgId, SUPPORT_CHECK_IN_PROGRAM, supportItemId, orderId],
  );
  if (!rowRes.rows[0]) {
    // A check-in opened by hand before any milestone projected: owed from now.
    rowRes = await client.query<LockedRow>(
      `INSERT INTO order_support_follow_ups (organization_id, order_id, program, state, due_at, support_ticket_id)
       VALUES ($1, $2, $3, 'due', $4::timestamptz, $5)
       ON CONFLICT (organization_id, order_id, program) DO UPDATE SET updated_at = now()
       RETURNING id, support_ticket_id, due_at, disposition, disposition_reason, outcome, closed_at, closed_by_staff_id`,
      [orgId, orderId, SUPPORT_CHECK_IN_PROGRAM, new Date(nowMs).toISOString(), supportItemId],
    );
  }
  const row = rowRes.rows[0];
  // The order's check-in already belongs to another Support item: this one is not it.
  if (row.support_ticket_id != null && Number(row.support_ticket_id) !== supportItemId) return null;

  const taskId = item.primary_task_id != null ? Number(item.primary_task_id) : null;
  // One transaction client: statements run one after another.
  const messagesRes = await client.query<{
    id: string | number;
    direction: CheckInMessageFact['direction'];
    delivery_state: DeliveryState | null;
    reply_disposition: CheckInMessageFact['replyDisposition'];
    at: Date | string;
  }>(
    `SELECT tm.id, tm.direction, tm.delivery_state, tm.reply_disposition,
            COALESCE(tm.occurred_at, tm.created_at) AS at
       FROM thread_messages tm
       JOIN entity_threads et
         ON et.id = tm.thread_id
        AND et.organization_id = tm.organization_id
      WHERE tm.organization_id = $1
        AND et.entity_type = 'SUPPORT_TICKET'
        AND et.entity_id = $2
        AND et.deleted_at IS NULL
        AND tm.deleted_at IS NULL
        AND tm.direction IN ('inbound', 'outbound')`,
    [orgId, supportItemId],
  );
  const taskRes = taskId == null
    ? null
    : await client.query<{
        next_follow_up_at: Date | string | null;
        follow_ups: Array<{
          id: string | number;
          direction: 'outbound' | 'inbound';
          channel: string;
          thread_message_id: string | number | null;
          occurred_at: string;
        }> | null;
      }>(
        `SELECT wa.next_follow_up_at,
                (SELECT json_agg(json_build_object(
                          'id', f.id, 'direction', f.direction, 'channel', f.channel,
                          'thread_message_id', f.thread_message_id, 'occurred_at', f.occurred_at))
                   FROM work_assignment_follow_ups f
                  WHERE f.organization_id = wa.organization_id
                    AND f.assignment_id = wa.id) AS follow_ups
           FROM work_assignments wa
          WHERE wa.organization_id = $1 AND wa.id = $2`,
        [orgId, taskId],
      );
  const taskRow = taskRes?.rows[0] ?? null;

  const messages: CheckInMessageFact[] = messagesRes.rows.map((m) => ({
    id: Number(m.id),
    direction: m.direction,
    deliveryState: m.delivery_state,
    replyDisposition: m.reply_disposition,
    atMs: toMs(m.at) ?? 0,
  }));
  const followUps: CheckInFollowUpFact[] = (taskRow?.follow_ups ?? []).map((f) => ({
    id: Number(f.id),
    direction: f.direction,
    channel: f.channel,
    threadMessageId: f.thread_message_id != null ? Number(f.thread_message_id) : null,
    atMs: toMs(f.occurred_at) ?? 0,
  }));
  const taskNextFollowUpAtMs = toMs(taskRow?.next_follow_up_at ?? null);

  // The stored closure — with its outcome — stands while the item stays resolved; a reopen derives no
  // closure, so the UPDATE below clears disposition, outcome and closed_at together.
  const storedClosure = storedCheckInClosure({
    disposition: row.disposition,
    outcome: row.outcome,
    reason: row.disposition_reason,
    closedAtMs: row.closed_at == null ? null : (toMs(row.closed_at) ?? nowMs),
    closedByStaffId: row.closed_by_staff_id,
  });

  const derived = deriveOrderCheckInState({
    nowMs,
    dueAtMs: toMs(row.due_at),
    item: {
      lifecycle: item.lifecycle,
      resolvedAtMs: toMs(item.resolved_at),
      resolvedByStaffId: item.resolved_by_staff_id ?? staffId,
    },
    messages,
    followUps,
    taskNextFollowUpAtMs,
    storedClosure,
  });

  const msIso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
  await client.query(
    `UPDATE order_support_follow_ups
        SET state = $3,
            support_ticket_id = $4,
            assignment_id = $5,
            contacted_at = $6::timestamptz,
            contact_message_id = $7,
            contact_follow_up_id = $8,
            latest_inbound_message_id = $9,
            next_follow_up_at = $10::timestamptz,
            chase_count = $11,
            disposition = $12,
            disposition_reason = $13,
            closed_at = $14::timestamptz,
            closed_by_staff_id = $15,
            outcome = $16,
            updated_at = now()
      WHERE organization_id = $1 AND id = $2`,
    [
      orgId,
      row.id,
      derived.state,
      supportItemId,
      taskId,
      msIso(derived.contactedAtMs),
      derived.contactMessageId,
      derived.contactFollowUpId,
      derived.latestInboundMessageId,
      msIso(derived.nextFollowUpAtMs),
      derived.chaseCount,
      derived.closure?.disposition ?? null,
      derived.closure?.reason ?? null,
      msIso(derived.closure?.closedAtMs ?? null),
      derived.closure?.closedByStaffId ?? null,
      derived.closure?.outcome ?? null,
    ],
  );

  if (taskId != null && derived.nextFollowUpFromChase && derived.nextFollowUpAtMs != null) {
    await client.query(
      `UPDATE work_assignments
          SET next_follow_up_at = $3::timestamptz, updated_at = now()
        WHERE organization_id = $1 AND id = $2 AND next_follow_up_at IS NULL`,
      [orgId, taskId, msIso(derived.nextFollowUpAtMs)],
    );
  }

  return readView(client, orgId, Number(row.id));
}

/**
 * Record how a resolved check-in closed — call inside the resolve transaction
 * AFTER the item is marked resolved. `resolved` requires its outcome (Happy /
 * Had an issue); `no_response_closed` requires a reason and carries none.
 * Null for an item that is not a check-in.
 */
export async function closeOrderCheckInForItem(
  client: PoolClient,
  args: {
    orgId: OrgId;
    supportItemId: number;
    staffId: number | null;
    disposition: 'resolved' | 'no_response_closed';
    outcome: CheckInOutcome | null;
    reason: string | null;
    nowMs: number;
  },
): Promise<OrderCheckInView | null> {
  const reason = String(args.reason ?? '').trim() || null;
  if (args.disposition === 'no_response_closed' && !reason) {
    throw new Error('no_response_closed requires a reason');
  }
  if (args.disposition === 'resolved' && args.outcome == null) {
    throw new Error('resolved check-in requires an outcome');
  }
  if (args.disposition === 'no_response_closed' && args.outcome != null) {
    throw new Error('no_response_closed carries no outcome');
  }
  const linked = await refreshOrderCheckInForItem(client, args);
  if (!linked) return null;
  await client.query(
    `UPDATE order_support_follow_ups
        SET state = $3, disposition = $3, outcome = $4, disposition_reason = $5, closed_at = $6::timestamptz,
            closed_by_staff_id = $7, updated_at = now()
      WHERE organization_id = $1 AND program = $2 AND support_ticket_id = $8`,
    [
      args.orgId,
      SUPPORT_CHECK_IN_PROGRAM,
      args.disposition,
      args.outcome,
      reason,
      new Date(args.nowMs).toISOString(),
      args.staffId,
      args.supportItemId,
    ],
  );
  return refreshOrderCheckInForItem(client, args);
}

/** The check-in a Support item drives, or null. */
export async function readOrderCheckInViewForItem(
  orgId: OrgId,
  supportItemId: number,
): Promise<OrderCheckInView | null> {
  const res = await tenantQueryOneTrip<ProjectionRow>(
    orgId,
    `${PROJECTION_VIEW_SELECT}
      WHERE f.organization_id = $1 AND f.program = $2 AND f.support_ticket_id = $3
      LIMIT 1`,
    [orgId, SUPPORT_CHECK_IN_PROGRAM, supportItemId],
  );
  return res.rows[0] ? checkInViewFromRow(res.rows[0]) : null;
}

/** The check-in of the order any line id belongs to, or null (audit read). */
export async function readOrderCheckInViewForOrder(orgId: OrgId, orderId: number): Promise<OrderCheckInView | null> {
  const res = await tenantQueryOneTrip<ProjectionRow>(
    orgId,
    `WITH rep AS (${REPRESENTATIVE_ORDER_ID_SQL})
     ${PROJECTION_VIEW_SELECT}
      WHERE f.organization_id = $1 AND f.program = $3 AND f.order_id = (SELECT id FROM rep)
      LIMIT 1`,
    [orgId, orderId, SUPPORT_CHECK_IN_PROGRAM],
  );
  return res.rows[0] ? checkInViewFromRow(res.rows[0]) : null;
}
