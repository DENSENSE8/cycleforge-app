import 'server-only';

import { withTenantTransaction } from '@/lib/tenancy/db';
import { upsertReceivingTriage } from '@/lib/receiving/streets/carton-street-write';


/** Flag a carton URGENT — the one writer of the shared unbox/test priority. */
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
