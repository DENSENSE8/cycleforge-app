import 'server-only';

import { withTenantTransaction } from '@/lib/tenancy/db';
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
    const found = await client.query<{ id: number }>(
      'SELECT id FROM orders WHERE id = ANY($1::int[])',
      [ids],
    );
    const updatedIds = found.rows.map((r) => Number(r.id));
    if (updatedIds.length === 0) return { ok: true, updatedIds: [] };

    if (flag === null) {
      await client.query('DELETE FROM order_flags WHERE order_id = ANY($1::int[])', [updatedIds]);
      return { ok: true, updatedIds };
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
    return { ok: true, updatedIds };
  });
}
