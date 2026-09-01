/**
 * Auto-cage — the ingest half of the accepted/exception **split**.
 *
 * Operator ruling R-FLOW-2 (2026-08-31, `docs/warehouse-os/PLAN-order-flow-spine-3h.md`
 * §2): a freshly ingested order enters the cage unless it is already clean —
 * the system splits sync output into *accepted* (all release gates green,
 * `release_state` stays NULL) and *exceptions* (`release_state = 'caged'`,
 * surfacing on `/shipping/exceptions` for triage).
 *
 * Two disciplines, both load-bearing:
 *
 * 1. **One rule.** The verdict comes from `evaluateReleaseGates` via
 *    `listOrderReleaseRecordsByIds` — the same pure function the release
 *    transaction enforces. No SQL copy of the gate logic exists here, so the
 *    split and the release can never disagree.
 * 2. **New rows only, defensively.** The UPDATE re-checks
 *    `release_state IS NULL` and skips rows that arrived already fulfilled
 *    (`status = 'shipped'` — the eBay lane imports 30 days of already-shipped
 *    orders and Amazon FBA rows land shipped; caging those would flood the
 *    desk with orders that need no triage). NULL-means-released stays the law
 *    for everything historical (`2026-08-30c`); this module never touches a
 *    row it was not handed as newly inserted.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { listOrderReleaseRecordsByIds } from './caged-orders';
import { selectAutoCageIds } from './auto-cage-core';

// The decision itself is the pure half — unit-tested without Neon.
export { selectAutoCageIds, type AutoCageCandidate } from './auto-cage-core';

/**
 * IO half: evaluate the live gates for the new rows and stamp the failures.
 * Returns the ids actually caged. Safe to re-run (the UPDATE predicate makes
 * it a no-op on anything already caged, released, or shipped since).
 */
export async function autoCageNewOrders(
  orgId: OrgId,
  newOrderIds: number[],
): Promise<number[]> {
  const ids = Array.from(new Set(newOrderIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (ids.length === 0) return [];

  const records = await listOrderReleaseRecordsByIds(orgId, ids);
  const toCage = selectAutoCageIds(
    records.map((r) => ({ id: r.id, status: r.status, canRelease: r.gates.canRelease })),
  );
  if (toCage.length === 0) return [];

  const res = await tenantQuery<{ id: number | string }>(
    orgId,
    `UPDATE orders
        SET release_state = 'caged'
      WHERE organization_id = $1
        AND id = ANY($2::bigint[])
        AND release_state IS NULL
        AND COALESCE(status, '') <> 'shipped'
      RETURNING id`,
    [orgId, toCage],
  );
  return res.rows.map((r) => Number(r.id));
}
