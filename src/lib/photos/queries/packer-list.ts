import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/** Packer-photo read helpers — the packing mirror of `receiving-list.ts`. */

const LINK_JOINS = `
  INNER JOIN photo_entity_links l ON l.photo_id = p.id AND l.organization_id = p.organization_id
`;

export interface PackerPhotoListRow {
  id: number;
  url: string;
  caption: string | null;
  uploadedBy: number | null;
  createdAt: string;
}

interface DbRow {
  id: string;
  caption: string | null;
  uploaded_by: number | null;
  created_at: string;
}

/** List every photo linked to one packer_log, oldest first. */
export async function listPackerPhotos(input: {
  organizationId: OrgId;
  packerLogId: number;
  contentUrl?: (id: number) => string;
}): Promise<PackerPhotoListRow[]> {
  const toUrl = input.contentUrl ?? ((id: number) => `/api/photos/${id}/content`);
  const res = await tenantQuery<DbRow>(
    input.organizationId,
    `SELECT DISTINCT ON (p.id)
       p.id,
       p.photo_type AS caption,
       p.taken_by_staff_id AS uploaded_by,
       p.created_at
       FROM photos p
       ${LINK_JOINS}
      WHERE p.organization_id = $1
        AND l.entity_type = 'PACKER_LOG'
        AND l.entity_id = $2
      ORDER BY p.id ASC, p.created_at ASC`,
    [input.organizationId, input.packerLogId],
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    url: toUrl(Number(r.id)),
    caption: r.caption,
    uploadedBy: r.uploaded_by != null ? Number(r.uploaded_by) : null,
    createdAt: r.created_at,
  }));
}

/** Count photos linked to one packer_log (for the live `total_photo_count`). */
export async function countPackerPhotos(
  organizationId: OrgId,
  packerLogId: number,
): Promise<number> {
  const res = await tenantQuery<{ c: string }>(
    organizationId,
    `SELECT COUNT(DISTINCT p.id) AS c
       FROM photos p
       ${LINK_JOINS}
      WHERE p.organization_id = $1
        AND l.entity_type = 'PACKER_LOG'
        AND l.entity_id = $2`,
    [organizationId, packerLogId],
  );
  return Number(res.rows[0]?.c ?? 0);
}

/** Resolve which packer_log a photo belongs to (for delete → publish). */
export async function getPackerPhotoLogId(
  photoId: number,
  organizationId: OrgId,
): Promise<number | null> {
  const res = await tenantQuery<{ entity_id: string }>(
    organizationId,
    `SELECT l.entity_id
       FROM photos p
       ${LINK_JOINS}
      WHERE p.id = $1
        AND p.organization_id = $2
        AND l.entity_type = 'PACKER_LOG'
      LIMIT 1`,
    [photoId, organizationId],
  );
  return res.rows[0] ? Number(res.rows[0].entity_id) : null;
}

/** Batch packer-photo counts keyed by TRACKING number — the read behind the search row's pack-photo CTA. */
export async function countPackerPhotosByTracking(input: {
  organizationId: OrgId;
  trackingKeys: string[];
}): Promise<Record<string, number>> {
  const keys = [...new Set(input.trackingKeys.filter((k) => k.length > 0))];
  if (keys.length === 0) return {};
  const res = await tenantQuery<{ tn: string; c: string }>(
    input.organizationId,
    `SELECT stn.tracking_number_normalized AS tn,
            COUNT(DISTINCT p.id) AS c
       FROM shipping_tracking_numbers stn
       JOIN packer_logs pl
         ON pl.shipment_id = stn.id AND pl.organization_id = stn.organization_id
       JOIN photo_entity_links l
         ON l.entity_type = 'PACKER_LOG'
        AND l.entity_id = pl.id
        AND l.organization_id = pl.organization_id
       JOIN photos p
         ON p.id = l.photo_id AND p.organization_id = l.organization_id
      WHERE stn.organization_id = $1
        AND stn.tracking_number_normalized = ANY($2::text[])
      GROUP BY stn.tracking_number_normalized`,
    [input.organizationId, keys],
  );
  const out: Record<string, number> = {};
  for (const row of res.rows) out[row.tn] = Number(row.c);
  return out;
}
