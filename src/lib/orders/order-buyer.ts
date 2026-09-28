/** Staff correction of an order's buyer — contact + ship-to — from the order record (`PATCH /api/orders/[id]/buyer`). */

import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { CustomerBillTo } from '@/lib/customers/customer-display';
import {
  insertCustomerInTx,
  replaceCustomerShipToInTx,
  updateCustomerContactInTx,
} from '@/lib/neon/customer-queries';
import type { CustomerCreate, OrderBuyerPatch } from '@/lib/schemas/customers';

export type OrderBuyerUpdateResult =
  | {
      ok: true;
      /** Every line of the order (same `orders.order_id`) — what repaints. */
      orderRowIds: number[];
      customerId: number;
      /** The order had no customer row; one was created from its ShipStation ship-to and linked. */
      customerCreated: boolean;
      /** False when every given value already matched the stored row. */
      changed: boolean;
      /** Repairs pointing at the customer — they display its contact too. */
      repairIds: number[];
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    }
  | { ok: false; status: 400 | 404; error: string };

/**
 * The customer to create for an order that has none: its ShipStation ship-to
 * snapshot with the staff edits laid over it. A buyer needs a name — from the
 * edit, else the snapshot's name or company.
 */
export function buyerFromShipToSnapshot(
  snapshot: CustomerBillTo | null,
  patch: OrderBuyerPatch,
): { ok: true; input: CustomerCreate } | { ok: false; error: string } {
  const snap = (key: keyof CustomerBillTo) => String(snapshot?.[key] ?? '').trim();
  const name = patch.name ?? (snap('name') || snap('company'));
  if (!name) return { ok: false, error: 'Name is required — this order has no buyer on file' };
  return {
    ok: true,
    input: {
      name,
      phone: patch.phone === undefined ? snap('phone') : (patch.phone ?? ''),
      email: patch.email ?? '',
      shipTo: patch.shipTo ?? {
        address1: snap('address1'),
        address2: snap('address2'),
        city: snap('city'),
        state: snap('state'),
        postalCode: snap('postalCode'),
        country: snap('country'),
      },
    },
  };
}

/**
 * Apply a buyer correction to the order row `orderRowId` (org-scoped).
 * Linked customer → correct its contact and ship-to in place. No customer
 * (ShipStation ship-to only) → create one from the snapshot + edits and link
 * it to every line of the order that has none. A written ship-to is stamped
 * `shipping_edited_at`, so labels are bought to it over ShipStation's.
 */
export async function updateOrderBuyer(
  orgId: OrgId,
  orderRowId: number,
  patch: OrderBuyerPatch,
): Promise<OrderBuyerUpdateResult> {
  return withTenantTransaction(orgId, async (client): Promise<OrderBuyerUpdateResult> => {
    const found = await client.query<{ order_id: string | null; customer_id: number | null }>(
      `SELECT order_id, customer_id FROM orders WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [orderRowId, orgId],
    );
    const order = found.rows[0];
    if (!order) return { ok: false, status: 404, error: 'Order not found' };

    const lines = await client.query<{ id: number }>(
      `SELECT id FROM orders
        WHERE organization_id = $1
          AND (id = $2 OR (btrim($3) <> '' AND order_id = $3))
        ORDER BY id`,
      [orgId, orderRowId, String(order.order_id ?? '')],
    );
    const orderRowIds = lines.rows.map((r) => Number(r.id));

    if (order.customer_id != null) {
      const customerId = Number(order.customer_id);
      const contact = await updateCustomerContactInTx(client, orgId, customerId, {
        name: patch.name,
        email: patch.email,
        phone: patch.phone,
      });
      if (!contact.ok) return contact;

      const changedCols = Object.keys(contact.columns) as (keyof typeof contact.before)[];
      const before: Record<string, unknown> = Object.fromEntries(changedCols.map((col) => [col, contact.before[col]]));
      const after: Record<string, unknown> = { ...contact.columns };
      if (patch.shipTo) {
        const prev = await replaceCustomerShipToInTx(client, orgId, customerId, patch.shipTo);
        if (!prev) return { ok: false, status: 404, error: 'Customer not found' };
        before.shipTo = prev;
        after.shipTo = patch.shipTo;
      }
      return {
        ok: true,
        orderRowIds,
        customerId,
        customerCreated: false,
        changed: changedCols.length > 0 || patch.shipTo !== undefined,
        repairIds: contact.repairIds,
        before,
        after,
      };
    }

    const snapshot = await client.query<{ ship_to: CustomerBillTo | null }>(
      `SELECT ship_to FROM shipstation_order_refs
        WHERE organization_id = $1 AND order_row_id = ANY($2::bigint[]) AND ship_to IS NOT NULL
        ORDER BY last_seen_at DESC NULLS LAST, id DESC
        LIMIT 1`,
      [orgId, orderRowIds],
    );
    const shipToSnapshot = snapshot.rows[0]?.ship_to ?? null;
    const plan = buyerFromShipToSnapshot(shipToSnapshot, patch);
    if (!plan.ok) return { ok: false, status: 400, error: plan.error };

    const created = await insertCustomerInTx(client, orgId, plan.input);
    if (patch.shipTo) await replaceCustomerShipToInTx(client, orgId, created.id, patch.shipTo);
    await client.query(
      `UPDATE orders SET customer_id = $1
        WHERE organization_id = $2 AND id = ANY($3::bigint[]) AND customer_id IS NULL`,
      [created.id, orgId, orderRowIds],
    );
    return {
      ok: true,
      orderRowIds,
      customerId: created.id,
      customerCreated: true,
      changed: true,
      repairIds: [],
      before: { customer_id: null, shipstation_ship_to: shipToSnapshot },
      after: { customer_id: created.id, ...plan.input },
    };
  });
}
