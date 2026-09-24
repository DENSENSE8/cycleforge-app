import 'server-only';

import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { readLiveOrderLabel, type LiveOrderLabel } from '@/lib/outbound/live-label';
import type { OutboundFulfillmentRoute } from '@/lib/outbound/work-contract';

/**
 * Write side of the Outbound Triage acknowledgment (`orders.acknowledged_at`,
 * `acknowledged_by`, `fulfillment_route`).
 *
 * An order is acknowledged once an operator has identified it, chosen its
 * route (PICK / QC) and made sure it carries exactly one live shipping label.
 * The label is a precondition, not a suggestion: acknowledging an order the
 * dock cannot scan out would hand the floor a box with nowhere to go, so the
 * refusal is decided here, under the order's row lock, with the same live-label
 * definition the Triage board displays (`readLiveOrderLabel`).
 */

type Queryable = Pick<PoolClient, 'query'>;

export interface OrderAcknowledgmentDeps {
  transaction: <T>(organizationId: OrgId, fn: (client: Queryable) => Promise<T>) => Promise<T>;
  readLiveLabel: (organizationId: OrgId, orderId: number, client: Queryable) => Promise<LiveOrderLabel | null>;
}

const defaultDeps: OrderAcknowledgmentDeps = {
  transaction: (organizationId, fn) => withTenantTransaction(organizationId, fn),
  readLiveLabel: readLiveOrderLabel,
};

export interface OrderAcknowledgment {
  orderId: number;
  acknowledgedAt: string | null;
  acknowledgedBy: number | null;
  route: OutboundFulfillmentRoute | null;
}

/**
 * Why an order cannot be acknowledged yet, in funnel order: it must be
 * identified (paired to the SKU catalog) and carry one live label.
 */
export type AcknowledgmentMissing = 'pairing' | 'label';

export type AcknowledgeResult =
  | { ok: true; before: OrderAcknowledgment; after: OrderAcknowledgment }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'not_ready'; missing: AcknowledgmentMissing[] };

export type UnacknowledgeResult =
  | { ok: true; before: OrderAcknowledgment; after: OrderAcknowledgment }
  | { ok: false; reason: 'not_found' };

interface AckRow {
  id: number | string;
  acknowledged_at: Date | string | null;
  acknowledged_by: number | string | null;
  fulfillment_route: OutboundFulfillmentRoute | null;
  sku_catalog_id?: number | string | null;
}

function toAcknowledgment(row: AckRow): OrderAcknowledgment {
  const at = row.acknowledged_at;
  return {
    orderId: Number(row.id),
    acknowledgedAt: at == null ? null : (at instanceof Date ? at : new Date(at)).toISOString(),
    acknowledgedBy: row.acknowledged_by == null ? null : Number(row.acknowledged_by),
    route: row.fulfillment_route ?? null,
  };
}

const LOCK_SQL = `SELECT id, acknowledged_at, acknowledged_by, fulfillment_route, sku_catalog_id
                    FROM orders
                   WHERE id = $1 AND organization_id = $2
                   FOR UPDATE`;

/**
 * Acknowledge an order on `route`. Re-acknowledging an acknowledged order
 * keeps who/when of the first acknowledgment and only changes the route, so a
 * retried or corrected click is a no-op on the timestamp.
 */
export async function acknowledgeOrder(
  args: { orderId: number; organizationId: OrgId; route: OutboundFulfillmentRoute; staffId: number | null },
  deps: OrderAcknowledgmentDeps = defaultDeps,
): Promise<AcknowledgeResult> {
  const { orderId, organizationId, route, staffId } = args;
  return deps.transaction(organizationId, async (client) => {
    const locked = await client.query<AckRow>(LOCK_SQL, [orderId, organizationId]);
    const current = locked.rows[0];
    if (!current) return { ok: false, reason: 'not_found' };

    const label = await deps.readLiveLabel(organizationId, orderId, client);
    if (!label) return { ok: false, reason: 'not_found' };
    const missing: AcknowledgmentMissing[] = [];
    if (current.sku_catalog_id == null) missing.push('pairing');
    if (!label.live) missing.push('label');
    if (missing.length > 0) return { ok: false, reason: 'not_ready', missing };

    const updated = await client.query<AckRow>(
      `UPDATE orders
          SET acknowledged_at = COALESCE(acknowledged_at, now()),
              acknowledged_by = CASE WHEN acknowledged_at IS NULL THEN $3::int ELSE acknowledged_by END,
              fulfillment_route = $4
        WHERE id = $1 AND organization_id = $2
        RETURNING id, acknowledged_at, acknowledged_by, fulfillment_route`,
      [orderId, organizationId, staffId, route],
    );
    return { ok: true, before: toAcknowledgment(current), after: toAcknowledgment(updated.rows[0]!) };
  });
}

/** Undo: clear the acknowledgment so the order returns to the Triage view. */
export async function unacknowledgeOrder(
  args: { orderId: number; organizationId: OrgId },
  deps: Pick<OrderAcknowledgmentDeps, 'transaction'> = defaultDeps,
): Promise<UnacknowledgeResult> {
  const { orderId, organizationId } = args;
  return deps.transaction(organizationId, async (client) => {
    const locked = await client.query<AckRow>(LOCK_SQL, [orderId, organizationId]);
    const current = locked.rows[0];
    if (!current) return { ok: false, reason: 'not_found' };

    const updated = await client.query<AckRow>(
      `UPDATE orders
          SET acknowledged_at = NULL, acknowledged_by = NULL, fulfillment_route = NULL
        WHERE id = $1 AND organization_id = $2
        RETURNING id, acknowledged_at, acknowledged_by, fulfillment_route`,
      [orderId, organizationId],
    );
    return { ok: true, before: toAcknowledgment(current), after: toAcknowledgment(updated.rows[0]!) };
  });
}
