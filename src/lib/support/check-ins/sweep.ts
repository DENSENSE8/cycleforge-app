/**
 * The post-purchase check-in sweep (cron `GET /api/cron/support/loop`, per org):
 *
 *   1. project — every order with a delivered / picked-up / shipped milestone
 *      since the program start gets its one projection row;
 *   2. open    — each due row with no Support item yet gets one through the
 *      ONE writer waist (`ingestSupportMessage`): kind
 *      post_purchase_check_in, purpose customer_conversation (program), the
 *      order's channel, an internal system message, the exact order as
 *      primary link. Ingest links the order, refreshes this projection and
 *      queues the check-in draft in its own transaction;
 *   3. refresh — open check-in items are re-derived so a chase instant that
 *      passed shows as follow_up_due (and its task carries the date).
 *
 * Idempotent: the projection is unique per order, and the opening message
 * carries a per-order `externalMessageId` / `clientEventId`, which ingest
 * checks before it resolves or creates anything — a replayed sweep (or two
 * racing ones) lands on the same Support item.
 */
import { ingestSupportMessage } from '@/lib/support/conversation/ingest';
import type { IngestSupportMessageResult, SupportMessageDraft } from '@/lib/support/conversation/ingest-types';
import type { OrderCheckInState, OrderCheckInView } from '@/lib/support/conversation/model';
import { loadOrderGroups, type OrderGroupFacts } from '@/lib/support/orders/order-facts';
import { loadOrderPlatformResolver, supportChannelForOrder } from '@/lib/support/orders/order-platform';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { SUPPORT_CHECK_IN_OPEN_BATCH, SUPPORT_CHECK_IN_PROGRAM, SUPPORT_CHECK_IN_REFRESH_BATCH } from './config';
import { projectOrderCheckInMilestones } from './milestones-db';
import { refreshOrderCheckInForItem } from './projection';

/** A projected row that fell due with no Support item yet. */
export interface DueCheckInRow {
  orderId: number;
  dueAt: string;
}

/** Closed projection states the refresh pass skips. */
const CLOSED_STATES: readonly OrderCheckInState[] = ['resolved', 'no_response_closed', 'not_applicable'];

export interface OrderCheckInSweepDeps {
  project(orgId: OrgId, nowMs: number): Promise<number>;
  listDueUnopened(orgId: OrgId, nowMs: number, limit: number): Promise<DueCheckInRow[]>;
  loadOrder(orgId: OrgId, orderId: number): Promise<OrderGroupFacts | null>;
  /** The org's designated Support assignee(s); none → the item lands Unassigned. */
  designatedAssignees(orgId: OrgId): Promise<number[]>;
  ingest(draft: SupportMessageDraft): Promise<IngestSupportMessageResult>;
  listOpenCheckInItems(orgId: OrgId, limit: number): Promise<Array<{ supportItemId: number; state: OrderCheckInState }>>;
  refreshItem(orgId: OrgId, supportItemId: number, nowMs: number): Promise<OrderCheckInView | null>;
  warn(message: string, details: Record<string, unknown>): void;
}

/** The opening message's idempotency key — one per order, forever. */
export function checkInOpeningKey(orderId: number): string {
  return `check-in:order:${orderId}`;
}

/** The waist draft that opens an order's check-in item. */
export function checkInOpeningDraft(args: {
  orgId: OrgId;
  order: OrderGroupFacts;
  dueAt: string;
  assigneeStaffIds: number[];
}): SupportMessageDraft {
  const { order } = args;
  const number = order.orderNumber ?? `#${order.representativeOrderId}`;
  const key = checkInOpeningKey(order.representativeOrderId);
  return {
    orgId: args.orgId,
    source: 'check_in_program',
    channel: supportChannelForOrder({
      platformSlug: order.platform.slug,
      customerEmail: order.customer.email,
      customerPhone: order.customer.phone,
    }),
    direction: 'internal',
    body: `Post-purchase check-in due for order ${number}`,
    subject: `Check-in · order ${number}`,
    occurredAt: args.dueAt,
    externalMessageId: key,
    clientEventId: key,
    kind: 'post_purchase_check_in',
    purpose: { value: 'customer_conversation', source: 'program', acknowledgedByStaffId: null },
    requester: { name: order.customer.name, email: order.customer.email, handle: null },
    accountLabel: order.platform.accountLabel ?? order.accountSource,
    platformAccountId: order.platform.platformAccountId,
    orderLinks: [{ orderId: order.representativeOrderId, primary: true, externalReference: null }],
    assigneeStaffIds: args.assigneeStaffIds,
    task: { urgency: 'normal', deadlineAt: null, title: `Check in on order ${number}` },
    authorStaffId: null,
    authorLabel: 'Check-in program',
    mode: 'live',
  };
}

export async function runOrderCheckInSweep(
  orgId: OrgId,
  nowMs: number,
  deps: OrderCheckInSweepDeps = defaultOrderCheckInSweepDeps,
): Promise<{ projected: number; opened: number; followUpDue: number }> {
  const projected = await deps.project(orgId, nowMs);

  let opened = 0;
  const due = await deps.listDueUnopened(orgId, nowMs, SUPPORT_CHECK_IN_OPEN_BATCH);
  if (due.length > 0) {
    const assignees = await deps.designatedAssignees(orgId);
    for (const row of due) {
      const order = await deps.loadOrder(orgId, row.orderId);
      if (!order) {
        deps.warn('check-in order vanished before opening', { orgId, orderId: row.orderId });
        continue;
      }
      const result = await deps.ingest(
        checkInOpeningDraft({ orgId, order, dueAt: row.dueAt, assigneeStaffIds: assignees }),
      );
      if (!result.ok) {
        deps.warn('check-in item could not open', { orgId, orderId: row.orderId, status: result.status, error: result.error });
        continue;
      }
      if (result.createdItem) opened++;
      // Ingest refreshed the projection in its own transaction; refreshing again
      // here links a replayed (idempotent) open and picks up the task id.
      await deps.refreshItem(orgId, result.supportItemId, nowMs);
    }
  }

  let followUpDue = 0;
  for (const open of await deps.listOpenCheckInItems(orgId, SUPPORT_CHECK_IN_REFRESH_BATCH)) {
    const view = await deps.refreshItem(orgId, open.supportItemId, nowMs);
    if (view?.state === 'follow_up_due' && open.state !== 'follow_up_due') followUpDue++;
  }

  return { projected, opened, followUpDue };
}

export const defaultOrderCheckInSweepDeps: OrderCheckInSweepDeps = {
  project: (orgId, nowMs) => projectOrderCheckInMilestones(orgId, nowMs, { kind: 'since_program_start' }),

  listDueUnopened: (orgId, nowMs, limit) =>
    withTenantTransaction(orgId, async (client) => {
      const res = await client.query<{ order_id: number; due_at: Date }>(
        `SELECT order_id, due_at
           FROM order_support_follow_ups
          WHERE organization_id = $1
            AND program = $2
            AND support_ticket_id IS NULL
            AND state IN ('not_due', 'due')
            AND due_at <= $3::timestamptz
          ORDER BY due_at, id
          LIMIT $4`,
        [orgId, SUPPORT_CHECK_IN_PROGRAM, new Date(nowMs).toISOString(), limit],
      );
      return res.rows.map((r) => ({ orderId: Number(r.order_id), dueAt: new Date(r.due_at).toISOString() }));
    }),

  async loadOrder(orgId, orderId) {
    const resolvePlatform = await loadOrderPlatformResolver(orgId);
    const groups = await withTenantTransaction(orgId, (client) =>
      loadOrderGroups(client, orgId, [orderId], resolvePlatform),
    );
    return groups.find((g) => g.lineIds.includes(orderId)) ?? null;
  },

  // No org-level designated Support assignee exists today (the `designated_*`
  // Zendesk tag names a staffer per ticket, not per org), so check-ins land
  // Unassigned for the team to claim.
  designatedAssignees: async () => [],

  ingest: (draft) => ingestSupportMessage(draft),

  listOpenCheckInItems: (orgId, limit) =>
    withTenantTransaction(orgId, async (client) => {
      const res = await client.query<{ support_ticket_id: string; state: OrderCheckInState }>(
        `SELECT support_ticket_id, state
           FROM order_support_follow_ups
          WHERE organization_id = $1
            AND program = $2
            AND support_ticket_id IS NOT NULL
            AND state <> ALL($3::text[])
          ORDER BY next_follow_up_at NULLS LAST, id
          LIMIT $4`,
        [orgId, SUPPORT_CHECK_IN_PROGRAM, CLOSED_STATES, limit],
      );
      return res.rows.map((r) => ({ supportItemId: Number(r.support_ticket_id), state: r.state }));
    }),

  refreshItem: (orgId, supportItemId, nowMs) =>
    withTenantTransaction(orgId, (client) =>
      refreshOrderCheckInForItem(client, { orgId, supportItemId, staffId: null, nowMs }),
    ),

  warn: (message, details) => console.warn(`[support-check-ins] ${message}`, details),
};
