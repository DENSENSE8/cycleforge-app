/**
 * The ONE writer of `order_list_removals` (see `./list-removal.ts`). Runs in
 * the caller's tenant transaction; every statement names the org.
 */

import 'server-only';
import type { PoolClient } from 'pg';
import { BUYER_CANCELLED_STATUS } from '@/lib/orders/buyer-cancelled';
import type { ListRemovalReason } from '@/lib/orders/list-removal';
import type { OrgId } from '@/lib/tenancy/constants';

interface RemoveArgs {
  orgId: OrgId;
  orderIds: readonly number[];
  reason: ListRemovalReason;
  note: string | null;
  staffId: number | null;
}

/** Take the orders off the list. An order already removed keeps its first removal. Returns the ids removed now. */
export async function removeOrdersFromList(client: PoolClient, args: RemoveArgs): Promise<number[]> {
  const { rows } = await client.query<{ order_id: number }>(
    `INSERT INTO order_list_removals (organization_id, order_id, reason, note, removed_by_staff_id, prior_status)
     SELECT $1, o.id, $3, $4, $5, o.status
       FROM orders o
      WHERE o.organization_id = $1 AND o.id = ANY($2::int[])
     ON CONFLICT (organization_id, order_id) WHERE restored_at IS NULL DO NOTHING
     RETURNING order_id`,
    [args.orgId, [...args.orderIds], args.reason, args.note, args.staffId],
  );
  const removed = rows.map((row) => Number(row.order_id));
  // A buyer cancel is also the order's own status, so search and the record keep saying "Buyer cancel".
  if (args.reason === 'buyer_cancelled' && removed.length > 0) {
    await client.query(`UPDATE orders SET status = $3 WHERE organization_id = $1 AND id = ANY($2::int[])`, [
      args.orgId,
      removed,
      BUYER_CANCELLED_STATUS,
    ]);
  }
  // A delivered removal is also the carrier's word: stamp the shipment so every
  // carrier-status surface (Shipped board, tracking lookups) agrees with the operator.
  if (args.reason === 'delivered' && removed.length > 0) {
    await client.query(
      `UPDATE shipping_tracking_numbers stn
          SET is_delivered = true,
              delivered_at = COALESCE(stn.delivered_at, now())
         FROM orders o
        WHERE o.organization_id = $1 AND o.id = ANY($2::int[])
          AND o.shipment_id = stn.id`,
      [args.orgId, removed],
    );
  }
  return removed;
}

/** Put the orders back (undo). Returns the ids restored. */
export async function restoreOrdersToList(
  client: PoolClient,
  args: { orgId: OrgId; orderIds: readonly number[]; staffId: number | null },
): Promise<number[]> {
  const { rows } = await client.query<{ order_id: number }>(
    `UPDATE order_list_removals
        SET restored_at = now(), restored_by_staff_id = $3
      WHERE organization_id = $1 AND order_id = ANY($2::int[]) AND restored_at IS NULL
      RETURNING order_id`,
    [args.orgId, [...args.orderIds], args.staffId],
  );
  const restored = rows.map((row) => Number(row.order_id));
  // Undoing a buyer cancel puts the order's status back to what it was — only where this removal set it.
  if (restored.length > 0) {
    await client.query(
      `UPDATE orders o
          SET status = r.prior_status
         FROM order_list_removals r
        WHERE o.organization_id = $1 AND o.id = ANY($2::int[]) AND o.status = $3
          AND r.organization_id = $1 AND r.order_id = o.id AND r.reason = 'buyer_cancelled'
          AND r.restored_at IS NOT NULL
          AND r.restored_at = (SELECT max(r2.restored_at) FROM order_list_removals r2 WHERE r2.organization_id = $1 AND r2.order_id = o.id)`,
      [args.orgId, restored, BUYER_CANCELLED_STATUS],
    );
    // Undoing a delivered removal takes the operator's carrier word back; a real
    // carrier refresh re-stamps it on the next poll.
    await client.query(
      `UPDATE shipping_tracking_numbers stn
          SET is_delivered = false,
              delivered_at = NULL
         FROM orders o
         JOIN order_list_removals r
           ON r.organization_id = o.organization_id AND r.order_id = o.id
        WHERE o.organization_id = $1 AND o.id = ANY($2::int[])
          AND o.shipment_id = stn.id
          AND r.reason = 'delivered'
          AND r.restored_at IS NOT NULL`,
      [args.orgId, restored],
    );
  }
  return restored;
}
