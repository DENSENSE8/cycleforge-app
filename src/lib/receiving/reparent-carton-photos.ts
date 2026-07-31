/**
 * Move all primary receiving photos from one carton onto another.
 *
 * Used when an unmatched carton is paired onto a busy matched PO shell — the
 * orphan's gallery must land on the winner so operators keep every shot. Does
 * not invent a second ownership model: only rewrites primary
 * `photo_entity_links` rows (RECEIVING + RECEIVING_LINE on the orphan's lines)
 * onto `toReceivingId` as RECEIVING, and refreshes denorm `photos.po_ref`.
 *
 * Caller supplies an open tenant tx client (relink / reconcile).
 */
import type { TxClient } from './relink-po';

interface ReparentReceivingCartonPhotosInput {
  orgId: string;
  fromReceivingId: number;
  toReceivingId: number;
  /** Winner's PO# for denorm po_ref (optional). */
  poRef?: string | null;
}

interface ReparentReceivingCartonPhotosResult {
  moved: number;
  photoIds: number[];
}

export async function reparentReceivingCartonPhotos(
  input: ReparentReceivingCartonPhotosInput,
  client: TxClient,
): Promise<ReparentReceivingCartonPhotosResult> {
  const { orgId, fromReceivingId, toReceivingId } = input;
  const poRef = input.poRef?.trim() || null;
  if (
    !Number.isFinite(fromReceivingId) ||
    !Number.isFinite(toReceivingId) ||
    fromReceivingId <= 0 ||
    toReceivingId <= 0 ||
    fromReceivingId === toReceivingId
  ) {
    return { moved: 0, photoIds: [] };
  }

  // Carton-scoped primary links.
  const cartonLinks = await client.query(
    `UPDATE photo_entity_links
        SET entity_id = $1
      WHERE organization_id = $2
        AND link_role = 'primary'
        AND entity_type = 'RECEIVING'
        AND entity_id = $3
      RETURNING photo_id`,
    [toReceivingId, orgId, fromReceivingId],
  );

  // Line-scoped primaries on lines still attached to the orphan carton —
  // remount as carton-level RECEIVING on the winner (orphan is usually lineless;
  // when it isn't, keep the blobs with the package rather than a demoted line).
  const lineLinks = await client.query(
    `UPDATE photo_entity_links pel
        SET entity_type = 'RECEIVING',
            entity_id = $1
       FROM receiving_line rl
      WHERE pel.organization_id = $2
        AND pel.link_role = 'primary'
        AND pel.entity_type = 'RECEIVING_LINE'
        AND pel.entity_id = rl.id
        AND rl.organization_id = $2
        AND rl.receiving_id = $3
      RETURNING pel.photo_id`,
    [toReceivingId, orgId, fromReceivingId],
  );

  const photoIdSet = new Set<number>();
  for (const row of cartonLinks.rows) {
    const id = Number(row.photo_id);
    if (Number.isFinite(id) && id > 0) photoIdSet.add(id);
  }
  for (const row of lineLinks.rows) {
    const id = Number(row.photo_id);
    if (Number.isFinite(id) && id > 0) photoIdSet.add(id);
  }
  const photoIds = Array.from(photoIdSet);
  if (photoIds.length === 0) return { moved: 0, photoIds: [] };

  await client.query(
    `UPDATE photos
        SET po_ref = COALESCE($3, po_ref),
            updated_at = NOW()
      WHERE organization_id = $1
        AND id = ANY($2::int[])`,
    [orgId, photoIds, poRef],
  );

  return { moved: photoIds.length, photoIds };
}
