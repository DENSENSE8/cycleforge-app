import { withTenantTransaction } from '@/lib/tenancy/db';
import type { PhotoEntityType } from './types';

/**
 * Persist the display order of an entity's `primary` photos. Display order is
 * `sort_order NULLS LAST, photo_id`; index 0 is the main (cover) photo.
 *
 * `orderedPhotoIds` become sort_order 1..n (unknown / foreign ids are ignored);
 * the entity's links NOT listed follow, keeping their current relative order.
 * Returns the number of links written.
 */
export async function reorderEntityPhotos(input: {
  organizationId: string;
  entityType: PhotoEntityType;
  entityId: number;
  orderedPhotoIds: readonly number[];
}): Promise<number> {
  const order = Array.from(
    new Set(input.orderedPhotoIds.filter((n) => Number.isSafeInteger(n) && n > 0)),
  );
  return withTenantTransaction(input.organizationId, async (client) => {
    const res = await client.query(
      `WITH wanted AS (
         SELECT pid, ord FROM unnest($4::bigint[]) WITH ORDINALITY AS v(pid, ord)
       ),
       ranked AS (
         SELECT l.id,
                ROW_NUMBER() OVER (
                  ORDER BY w.ord ASC NULLS LAST, l.sort_order ASC NULLS LAST, l.photo_id ASC
                )::int AS pos
           FROM photo_entity_links l
           LEFT JOIN wanted w ON w.pid = l.photo_id
          WHERE l.organization_id = $1 AND l.entity_type = $2 AND l.entity_id = $3
            AND l.link_role = 'primary'
       )
       UPDATE photo_entity_links l
          SET sort_order = r.pos
         FROM ranked r
        WHERE l.id = r.id AND l.sort_order IS DISTINCT FROM r.pos`,
      [input.organizationId, input.entityType, input.entityId, order],
    );
    return res.rowCount ?? 0;
  });
}
