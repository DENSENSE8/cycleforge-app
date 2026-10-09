import type { PoolClient } from 'pg';
import { photoContentUrl } from './display-url';
import { marketplaceImageKey, marketplaceRenditionEdge } from './marketplace-thumb-url';
import type { PhotoAspect } from './photo-aspects';
import type { PhotoEntityType, PhotoLinkRole } from './types';

interface InsertPhotoCatalogInput {
  organizationId: string;
  staffId: number | null;
  photoType?: string | null;
  poRef?: string | null;
  /**
   * Device-reported capture instant, already normalized by
   * `../capture-provenance.ts`. Absent/null is the honest value for a surface
   * with no device timestamp — never substitute `now()` or `created_at` here.
   */
  clientCapturedAt?: Date | null;
  /**
   * What this shot SHOWS, within its stage (`../photo-aspects.ts`). Absent/null
   * is legal and means *unclassified evidence* — never *missing evidence*. Legality
   * against the resolved stage is decided at the route edge, before we get here.
   */
  photoAspect?: PhotoAspect | null;
}

/** Insert a catalog row (no entity columns — links + storage hold relationships/bytes). */
export async function insertPhotoCatalog(
  client: PoolClient,
  input: InsertPhotoCatalogInput,
): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO photos (taken_by_staff_id, photo_type, organization_id, po_ref, client_captured_at, photo_aspect)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.staffId,
      input.photoType ?? null,
      input.organizationId,
      input.poRef ?? null,
      input.clientCapturedAt ?? null,
      input.photoAspect ?? null,
    ],
  );
  return Number(rows[0].id);
}

export async function findPhotoByEntityLegacyUrl(
  client: PoolClient,
  input: {
    organizationId: string;
    entityType: PhotoEntityType;
    entityId: number;
    legacyUrl: string;
    linkRole?: PhotoLinkRole;
  },
): Promise<number | null> {
  const role = input.linkRole ?? 'primary';
  const res = await client.query<{ id: string }>(
    `SELECT p.id
       FROM photos p
       JOIN photo_entity_links l
         ON l.photo_id = p.id AND l.organization_id = p.organization_id
       JOIN photo_storage ps
         ON ps.photo_id = p.id AND ps.organization_id = p.organization_id AND ps.is_primary
      WHERE p.organization_id = $1
        AND l.entity_type = $2
        AND l.entity_id = $3
        AND l.link_role = $4
        AND ps.legacy_url = $5
      LIMIT 1`,
    [input.organizationId, input.entityType, input.entityId, role, input.legacyUrl],
  );
  return res.rows[0] ? Number(res.rows[0].id) : null;
}

/**
 * A photo already on this entity (any link role, or — for a SKU — in its
 * listing gallery) that is another marketplace rendition of `legacyUrl`'s
 * picture ({@link marketplaceImageKey}); the highest rendition when several.
 * Null for a URL that is not an eBay / Amazon CDN rendition.
 */
export async function findEntityRenditionTwin(
  client: PoolClient,
  input: {
    organizationId: string;
    entityType: PhotoEntityType;
    entityId: number;
    legacyUrl: string;
  },
): Promise<{ photoId: number; legacyUrl: string } | null> {
  const key = marketplaceImageKey(input.legacyUrl);
  if (!key) return null;
  const res = await client.query<{ photo_id: string; legacy_url: string }>(
    `SELECT ps.photo_id, ps.legacy_url
       FROM photo_storage ps
      WHERE ps.organization_id = $1
        AND ps.provider = 'legacy_url'
        AND ps.is_primary
        AND (ps.photo_id IN (SELECT l.photo_id FROM photo_entity_links l
                              WHERE l.organization_id = $1 AND l.entity_type = $2 AND l.entity_id = $3)
             OR ($2 = 'SKU' AND ps.photo_id IN (SELECT lp.photo_id FROM listing_photos lp
                                                 WHERE lp.organization_id = $1 AND lp.sku_catalog_id = $3)))`,
    [input.organizationId, input.entityType, input.entityId],
  );
  let best: { photoId: number; legacyUrl: string } | null = null;
  for (const row of res.rows) {
    if (marketplaceImageKey(row.legacy_url) !== key) continue;
    if (!best || marketplaceRenditionEdge(row.legacy_url) > marketplaceRenditionEdge(best.legacyUrl)) {
      best = { photoId: Number(row.photo_id), legacyUrl: row.legacy_url };
    }
  }
  return best;
}

export function photoDisplayUrls(photoId: number) {
  return {
    url: photoContentUrl(photoId),
    thumbUrl: photoContentUrl(photoId, 'thumb'),
  };
}
