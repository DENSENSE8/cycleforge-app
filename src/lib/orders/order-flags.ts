import 'server-only';

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { isOrderRowFlagId, type OrderRowFlagId } from './order-row-flags';

/** Write side of the order row flag (`order_flags`). */

interface SetOrderFlagArgs {
  orderId: number;
  organizationId: OrgId;
  /** `null` clears the flag — the same call sets and unsets. */
  flag: OrderRowFlagId | null;
  /** Attribution for a SHARED signal. Null only when the actor is unresolved. */
  staffId: number | null;
}

type SetOrderFlagResult =
  | { ok: true; flag: OrderRowFlagId | null }
  | { ok: false; reason: 'not_found' | 'invalid_flag' };

/** Set or clear one order's flag. */
export async function setOrderFlag({
  orderId,
  organizationId,
  flag,
  staffId,
}: SetOrderFlagArgs): Promise<SetOrderFlagResult> {
  if (flag !== null && !isOrderRowFlagId(flag)) return { ok: false, reason: 'invalid_flag' };

  return withTenantTransaction<SetOrderFlagResult>(organizationId, async (client) => {
    const exists = await client.query('SELECT 1 FROM orders WHERE id = $1 LIMIT 1', [orderId]);
    if (exists.rowCount === 0) return { ok: false, reason: 'not_found' };

    if (flag === null) {
      await client.query('DELETE FROM order_flags WHERE order_id = $1', [orderId]);
      return { ok: true, flag: null };
    }

    await client.query(
      `INSERT INTO order_flags (order_id, flag, set_by_staff_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, order_id) DO UPDATE
         SET flag            = EXCLUDED.flag,
             set_by_staff_id = EXCLUDED.set_by_staff_id,
             updated_at      = now()`,
      [orderId, flag, staffId],
    );
    return { ok: true, flag };
  });
}

/** Set or clear the flag on many orders at once — the multi-select plane (`ContextualSelectionBar`) writes one value onto N rows, which is… */
export async function setOrderFlagBulk({
  orderIds,
  organizationId,
  flag,
  staffId,
}: Omit<SetOrderFlagArgs, 'orderId'> & { orderIds: readonly number[] }): Promise<{
  ok: boolean;
  updatedIds: number[];
  reason?: 'invalid_flag';
}> {
  if (flag !== null && !isOrderRowFlagId(flag)) return { ok: false, updatedIds: [], reason: 'invalid_flag' };
  const ids = [...new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return { ok: true, updatedIds: [] };

  return withTenantTransaction(organizationId, async (client) => {
    const { updatedIds } = await setOrderFlagsInTx(client, organizationId, ids, flag, staffId);
    return { ok: true, updatedIds };
  });
}

type FlagTx = Pick<PoolClient, 'query'>;

/** An order's flag before a write — what an undo puts back (`null` = it had none). */
export interface PriorOrderFlag {
  orderId: number;
  flag: OrderRowFlagId | null;
}

/**
 * Set (or clear with `null`) the flag on many orders inside the caller's
 * transaction, reporting each touched order's PRIOR flag so the change can be
 * undone exactly. Ids outside the org are skipped, never an error.
 */
export async function setOrderFlagsInTx(
  client: FlagTx,
  organizationId: OrgId,
  orderIds: readonly number[],
  flag: OrderRowFlagId | null,
  staffId: number | null,
): Promise<{ updatedIds: number[]; prior: PriorOrderFlag[] }> {
  const found = await client.query<{ id: number; flag: string | null }>(
    `SELECT o.id, f.flag
       FROM orders o
       LEFT JOIN order_flags f ON f.order_id = o.id AND f.organization_id = o.organization_id
      WHERE o.organization_id = $1 AND o.id = ANY($2::int[])`,
    [organizationId, [...orderIds]],
  );
  const prior = found.rows.map((r) => ({
    orderId: Number(r.id),
    flag: isOrderRowFlagId(r.flag) ? r.flag : null,
  }));
  const updatedIds = prior.map((p) => p.orderId);
  if (updatedIds.length === 0) return { updatedIds, prior };

  if (flag === null) {
    await client.query('DELETE FROM order_flags WHERE organization_id = $1 AND order_id = ANY($2::int[])', [organizationId, updatedIds]);
    return { updatedIds, prior };
  }

  await client.query(
    `INSERT INTO order_flags (order_id, flag, set_by_staff_id)
     SELECT unnest($1::int[]), $2, $3
     ON CONFLICT (organization_id, order_id) DO UPDATE
       SET flag            = EXCLUDED.flag,
           set_by_staff_id = EXCLUDED.set_by_staff_id,
           updated_at      = now()`,
    [updatedIds, flag, staffId],
  );
  return { updatedIds, prior };
}

/** Put each order's flag back to what {@link setOrderFlagsInTx} reported as prior. */
export async function restoreOrderFlagsInTx(
  client: FlagTx,
  organizationId: OrgId,
  prior: readonly PriorOrderFlag[],
  staffId: number | null,
): Promise<number[]> {
  const restored: number[] = [];
  const groups = new Map<OrderRowFlagId | null, number[]>();
  for (const p of prior) groups.set(p.flag, [...(groups.get(p.flag) ?? []), p.orderId]);
  for (const [flag, ids] of groups) {
    restored.push(...(await setOrderFlagsInTx(client, organizationId, ids, flag, staffId)).updatedIds);
  }
  return restored;
}
