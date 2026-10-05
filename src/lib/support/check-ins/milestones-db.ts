/**
 * Projects fulfillment milestones into `order_support_follow_ups` — one row
 * per customer order (keyed by its representative `orders.id`), never a
 * second one. Writers: the check-in sweep (every order with a milestone since
 * the program start), the carrier DELIVERED hook and the dock SHIP_CONFIRM
 * hook (just the orders that moved).
 *
 * A row is only rewritten while nothing has happened on it yet (no Support
 * item, state not_due / due / not_applicable): a later, stronger milestone
 * (delivered after a shipped fallback) or a fixed eligibility fact moves it;
 * an opened check-in is the Support item's to drive.
 */
import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { OrderCheckInState } from '@/lib/support/conversation/model';
import { loadOrderGroups } from '@/lib/support/orders/order-facts';
import { loadOrderPlatformResolver, type OrderPlatformResolver } from '@/lib/support/orders/order-platform';
import { SUPPORT_CHECK_IN_PROGRAM, supportCheckInProgramStartMs } from './config';
import { deriveOrderCheckInMilestone, type OrderCheckInMilestone } from './milestones';

/** Which orders a projection pass looks at. */
export type CheckInProjectionScope =
  | { kind: 'since_program_start' }
  | { kind: 'shipment'; shipmentId: number }
  | { kind: 'orders'; orderIds: number[] };

/** The state a freshly projected (not yet opened) row lands in. */
export function projectedCheckInState(m: OrderCheckInMilestone, nowMs: number): OrderCheckInState {
  if (m.notApplicableReason) return 'not_applicable';
  return Date.parse(m.dueAt) <= nowMs ? 'due' : 'not_due';
}

/** Order line ids whose milestone facts may have changed, per scope. `$1` org. */
async function seedOrderIds(
  client: Pick<PoolClient, 'query'>,
  orgId: OrgId,
  scope: CheckInProjectionScope,
  programStartIso: string,
): Promise<number[]> {
  if (scope.kind === 'orders') return scope.orderIds;
  if (scope.kind === 'shipment') {
    const res = await client.query<{ id: number }>(
      `SELECT o.id
         FROM orders o
        WHERE o.organization_id = $1
          AND (o.shipment_id = $2
               OR EXISTS (SELECT 1 FROM shipment_links sl
                           WHERE sl.organization_id = o.organization_id
                             AND sl.owner_type = 'ORDER'
                             AND sl.owner_id = o.id
                             AND sl.shipment_id = $2))`,
      [orgId, scope.shipmentId],
    );
    return res.rows.map((r) => Number(r.id));
  }
  // Every line with a carrier or dock milestone on/after the program start.
  const res = await client.query<{ id: number }>(
    `WITH moved AS (
       SELECT stn.id
         FROM shipping_tracking_numbers stn
        WHERE stn.delivered_at >= $2::timestamptz
           OR stn.carrier_accepted_at >= $2::timestamptz
     )
     SELECT o.id
       FROM orders o
      WHERE o.organization_id = $1
        AND (
             o.shipment_id IN (SELECT id FROM moved)
          OR EXISTS (SELECT 1 FROM shipment_links sl
                      WHERE sl.organization_id = o.organization_id
                        AND sl.owner_type = 'ORDER'
                        AND sl.owner_id = o.id
                        AND sl.shipment_id IN (SELECT id FROM moved))
          OR EXISTS (SELECT 1 FROM station_activity_logs sal
                      WHERE sal.organization_id = o.organization_id
                        AND sal.activity_type = 'SHIP_CONFIRM'
                        AND sal.created_at >= $2::timestamptz
                        AND (sal.order_row_id = o.id OR sal.shipment_id = o.shipment_id))
        )`,
    [orgId, programStartIso],
  );
  return res.rows.map((r) => Number(r.id));
}

/**
 * Upsert projected milestones; returns how many rows were inserted or
 * actually changed. Opened rows (a Support item exists) are never rewritten.
 */
export async function upsertOrderCheckInProjection(
  client: Pick<PoolClient, 'query'>,
  orgId: OrgId,
  milestones: readonly OrderCheckInMilestone[],
  nowMs: number,
): Promise<number> {
  if (milestones.length === 0) return 0;
  const res = await client.query(
    `INSERT INTO order_support_follow_ups AS f
       (organization_id, order_id, program, state, trigger_kind, trigger_ref, trigger_at, due_at, not_applicable_reason)
     SELECT $1, u.order_id, $2, u.state, u.trigger_kind, u.trigger_ref, u.trigger_at, u.due_at, u.reason
       FROM unnest($3::int[], $4::text[], $5::text[], $6::text[], $7::timestamptz[], $8::timestamptz[], $9::text[])
            AS u(order_id, state, trigger_kind, trigger_ref, trigger_at, due_at, reason)
     ON CONFLICT (organization_id, order_id, program) DO UPDATE
        SET state = EXCLUDED.state,
            trigger_kind = EXCLUDED.trigger_kind,
            trigger_ref = EXCLUDED.trigger_ref,
            trigger_at = EXCLUDED.trigger_at,
            due_at = EXCLUDED.due_at,
            not_applicable_reason = EXCLUDED.not_applicable_reason,
            updated_at = now()
      WHERE f.support_ticket_id IS NULL
        AND f.state IN ('not_due', 'due', 'not_applicable')
        AND (f.state, f.trigger_kind, f.trigger_ref, f.trigger_at, f.due_at, f.not_applicable_reason)
            IS DISTINCT FROM
            (EXCLUDED.state, EXCLUDED.trigger_kind, EXCLUDED.trigger_ref, EXCLUDED.trigger_at,
             EXCLUDED.due_at, EXCLUDED.not_applicable_reason)
     RETURNING f.id`,
    [
      orgId,
      SUPPORT_CHECK_IN_PROGRAM,
      milestones.map((m) => m.orderId),
      milestones.map((m) => projectedCheckInState(m, nowMs)),
      milestones.map((m) => m.triggerKind),
      milestones.map((m) => m.triggerRef),
      milestones.map((m) => m.triggerAt),
      milestones.map((m) => m.dueAt),
      milestones.map((m) => m.notApplicableReason),
    ],
  );
  return res.rowCount ?? 0;
}

/** Projected rows whose due instant passed while nobody opened them yet flip not_due → due. */
async function markProjectedRowsDue(client: Pick<PoolClient, 'query'>, orgId: OrgId, nowMs: number): Promise<number> {
  const res = await client.query(
    `UPDATE order_support_follow_ups
        SET state = 'due', updated_at = now()
      WHERE organization_id = $1
        AND program = $2
        AND state = 'not_due'
        AND support_ticket_id IS NULL
        AND due_at <= $3::timestamptz`,
    [orgId, SUPPORT_CHECK_IN_PROGRAM, new Date(nowMs).toISOString()],
  );
  return res.rowCount ?? 0;
}

/** One projection pass in the caller's transaction. Returns rows inserted / changed. */
export async function projectOrderCheckInMilestonesInTx(
  client: PoolClient,
  args: {
    orgId: OrgId;
    nowMs: number;
    scope: CheckInProjectionScope;
    resolvePlatform: OrderPlatformResolver;
    programStartMs?: number;
  },
): Promise<number> {
  const programStartMs = args.programStartMs ?? supportCheckInProgramStartMs();
  const seeds = await seedOrderIds(client, args.orgId, args.scope, new Date(programStartMs).toISOString());
  const groups = await loadOrderGroups(client, args.orgId, seeds, args.resolvePlatform);
  const milestones = groups
    .map((g) => deriveOrderCheckInMilestone(g, { programStartMs }))
    .filter((m): m is OrderCheckInMilestone => m != null);
  const upserted = await upsertOrderCheckInProjection(client, args.orgId, milestones, args.nowMs);
  const flipped = args.scope.kind === 'since_program_start' ? await markProjectedRowsDue(client, args.orgId, args.nowMs) : 0;
  return upserted + flipped;
}

/** Own-transaction projection pass (sweep and hooks). */
export async function projectOrderCheckInMilestones(
  orgId: OrgId,
  nowMs: number,
  scope: CheckInProjectionScope,
): Promise<number> {
  const resolvePlatform = await loadOrderPlatformResolver(orgId);
  return withTenantTransaction(orgId, (client) =>
    projectOrderCheckInMilestonesInTx(client, { orgId, nowMs, scope, resolvePlatform }),
  );
}

/** Carrier DELIVERED hook: project the orders that own this shipment. Never throws. */
export async function recordOrderCheckInMilestonesForShipment(orgId: OrgId, shipmentId: number): Promise<void> {
  try {
    await projectOrderCheckInMilestones(orgId, Date.now(), { kind: 'shipment', shipmentId });
  } catch (err) {
    console.error('[support-check-ins] delivered milestone projection failed', { orgId, shipmentId, err });
  }
}

/** Dock SHIP_CONFIRM hook (counter pickup handed over / box left): project this order. Never throws. */
export async function recordOrderCheckInMilestonesForOrder(orgId: OrgId, orderId: number): Promise<void> {
  try {
    await projectOrderCheckInMilestones(orgId, Date.now(), { kind: 'orders', orderIds: [orderId] });
  } catch (err) {
    console.error('[support-check-ins] ship-confirm milestone projection failed', { orgId, orderId, err });
  }
}
