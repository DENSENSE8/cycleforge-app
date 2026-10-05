import 'server-only';

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/** `order_tags` — the ONE writer. A package's tags are a set: adding a held label is a no-op, removing an absent one too. */

type TagWriteResult = { ok: true; tags: string[] } | { ok: false; reason: 'not_found' };

const TAGS_OF_ORDER_SQL = `SELECT COALESCE(array_agg(tag ORDER BY created_at, id), ARRAY[]::text[]) AS tags
   FROM order_tags WHERE organization_id = $1 AND order_id = $2`;

export async function listOrderTags(orderId: number, organizationId: OrgId): Promise<string[]> {
  return withTenantTransaction(organizationId, async (client) => {
    const { rows } = await client.query<{ tags: string[] }>(TAGS_OF_ORDER_SQL, [organizationId, orderId]);
    return rows[0]?.tags ?? [];
  });
}

export async function writeOrderTag({
  orderId,
  organizationId,
  tag,
  staffId,
  op,
}: {
  orderId: number;
  organizationId: OrgId;
  /** Already normalized (`normalizePackageTag`). */
  tag: string;
  staffId: number | null;
  op: 'add' | 'remove';
}): Promise<TagWriteResult> {
  return withTenantTransaction<TagWriteResult>(organizationId, async (client) => {
    const exists = await client.query('SELECT 1 FROM orders WHERE id = $1 AND organization_id = $2 LIMIT 1', [
      orderId,
      organizationId,
    ]);
    if (exists.rowCount === 0) return { ok: false, reason: 'not_found' };

    if (op === 'add') {
      await client.query(
        `INSERT INTO order_tags (organization_id, order_id, tag, created_by_staff_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, order_id, lower(tag)) DO NOTHING`,
        [organizationId, orderId, tag, staffId],
      );
    } else {
      await client.query(
        'DELETE FROM order_tags WHERE organization_id = $1 AND order_id = $2 AND lower(tag) = lower($3)',
        [organizationId, orderId, tag],
      );
    }
    const { rows } = await client.query<{ tags: string[] }>(TAGS_OF_ORDER_SQL, [organizationId, orderId]);
    return { ok: true, tags: rows[0]?.tags ?? [] };
  });
}
