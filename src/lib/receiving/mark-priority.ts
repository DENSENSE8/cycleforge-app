import 'server-only';

import { withTenantTransaction } from '@/lib/tenancy/db';
import { upsertReceivingTriage } from '@/lib/receiving/streets/carton-street-write';


/**
 * Flag a carton URGENT — the one writer of the shared unbox/test priority.
 *
 * Two signals promote a carton at the door, and they must write the same flag
 * or "urgent" means two different things depending on which one fired:
 *
 *  - a door-scanned carton whose SKUs a PENDING ORDER needs
 *    (`findPendingOrderSkuMatches`, the durable half of `priority_unbox`);
 *  - a door-scanned carton somebody is WATCHING — a person typed that tracking
 *    number into their inbox and is waiting for it
 *    (`promoteWatchedArrival`).
 *
 * `is_priority` floats the carton to rank-0 through
 * `RECEIVING_PRIORITY_RANK_SQL`, which is what puts it at the top of the unbox
 * queue's pinned urgent band AND the tester's queue — so "urgent to unbox"
 * carries through to test.
 *
 * IDEMPOTENT by compare-and-set: a re-scan of an already-urgent carton writes
 * nothing and returns false, so a caller can key a notification or a toast on
 * the return value without buzzing an operator twice for one carton.
 *
 * Lane routing is COALESCE-once: `priority_lane` is stamped only when the
 * operator has not picked one — manual always wins, the same rule
 * `priority_tier` follows against `is_priority`.
 *
 * ## Why this is NOT `createUrgencyDeps().setCartonUrgency`
 *
 * Both write `is_priority` + `priority_tier` on `receiving_carton`, so the
 * question is fair, and the answer has to be written down or the next edit
 * merges them and breaks one caller:
 *
 *  - `setCartonUrgency` is the CROSS-ENTITY rung. It is bidirectional (an
 *    order, a carton and a ticket all move between `urgent` and `normal`
 *    through one vocabulary), it CLEARS back to `priority_tier = NULL`, and it
 *    knows nothing about receiving triage.
 *  - This is the DOOR's promotion. It is one-way — a door signal never demotes
 *    a carton — and it carries a second write the urgency rung must not know
 *    about: the `priority_lane` routing (`RETURN` vs `PO_STOCKOUT`) on the
 *    triage street, stamped COALESCE-once in the same transaction.
 *
 * Routing the door through the rung would either drag triage-lane routing into
 * a cross-entity module or drop it. Two writers, two contracts, named — and
 * every door signal comes through THIS one.
 *
 * Best-effort: a failure here is logged and swallowed. A carton that arrived is
 * more important than a flag on it, and every door path calls this inline.
 */
export async function markReceivingPriority(
  receivingId: number | null,
  orgId: string,
): Promise<boolean> {
  if (!receivingId || !Number.isFinite(receivingId)) return false;
  try {
    return await withTenantTransaction(orgId, async (client) => {
      const upd = await client.query<{ is_return: boolean | null }>(
        `UPDATE receiving_carton
            SET is_priority = true,
                priority_tier = 0,
                updated_at = NOW()
          WHERE id = $1 AND (priority_tier IS DISTINCT FROM 0 OR is_priority = false)
          RETURNING is_return`,
        [receivingId],
      );
      if ((upd.rowCount ?? 0) === 0) return false;

      const cur = await client.query<{ priority_lane: string | null }>(
        `SELECT priority_lane FROM receiving_triage
          WHERE receiving_id = $1 AND organization_id = $2
          LIMIT 1`,
        [receivingId, orgId],
      );
      if ((cur.rows[0]?.priority_lane ?? null) == null) {
        await upsertReceivingTriage(client, orgId, receivingId, {
          priorityLane: upd.rows[0]?.is_return ? 'RETURN' : 'PO_STOCKOUT',
        });
      }
      return true;
    });
  } catch (err) {
    console.warn('markReceivingPriority failed', err instanceof Error ? err.message : err);
    return false;
  }
}
