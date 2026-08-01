import 'server-only';

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { isOrderRowFlagId, type OrderRowFlagId } from './order-row-flags';

/**
 * Write side of the order row flag (`order_flags`).
 *
 * The vocabulary and every presentation decision live in the dependency-free
 * `order-row-flags.ts`; this module is only the persistence half, so the API
 * route stays thin (validate → domain helper → audit) per
 * `.claude/rules/backend-patterns.md`.
 *
 * Reads do NOT come through here. The queue needs the flag on every row, and a
 * per-row fetch would be an N+1 against a virtualized grid — it is joined into
 * the shared `ORDER_SERIALS_CTE` in `lib/neon/orders-queries.ts` instead, so
 * the flag arrives with the row that renders it.
 */

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

/**
 * Set or clear one order's flag. Idempotent by construction: the upsert targets
 * `ux_order_flags_org_order`, so re-sending the same flag is a no-op update
 * rather than a duplicate row, and a double-click from the selection bar cannot
 * fan out into two records.
 *
 * Existence is checked against `orders` first rather than relying on the FK:
 * a bad id must come back as a 404 the operator can act on, not a raw
 * constraint violation surfaced as a 500.
 */
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

/**
 * Set or clear the flag on many orders at once — the multi-select plane
 * (`ContextualSelectionBar`) writes one value onto N rows, which is the one
 * case that genuinely is a single bulk mutation rather than per-record
 * judgement (`display/workbench.md` → Action planes).
 *
 * Returns the ids that actually exist in this org. Ids that do not are silently
 * dropped rather than failing the batch: a stale selection (a row shipped out
 * from under the operator) must not throw away the other nine flags.
 */
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
