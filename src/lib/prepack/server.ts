import 'server-only';

import type { QueryResultRow } from 'pg';
import { unwrapScannedSerial } from '@/lib/barcode-routing';
import { recordUnitEvent } from '@/lib/inventory/unit-events';
import type { OrgId } from '@/lib/tenancy/constants';
import { skuCatalogImageUrlSql } from '@/lib/photos/sku-catalog-image-sql';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import {
  PREPACK_KIT_PART_TYPES,
  parsePrepackProvenance,
  type PrepackCatalogChoice,
  type PrepackContentFact,
  type PrepackEvidence,
  type PrepackKit,
  type PrepackKitPartType,
  type PrepackUnit,
} from './types';

interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

const KIT_TYPES_SQL = PREPACK_KIT_PART_TYPES.map((type) => `'${type}'`).join(', ');

export async function searchPrepackCatalog(
  orgId: OrgId,
  input: { query?: string | null; sku?: string | null; limit?: number },
): Promise<PrepackCatalogChoice[]> {
  const q = String(input.query ?? '').trim();
  const sku = String(input.sku ?? '').trim();
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const terms = Array.from(new Set(
    q.toLocaleLowerCase('en-US')
      .normalize('NFKD')
      .replace(/[^a-z0-9-]+/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length >= 2),
  )).slice(0, 10);
  const { rows } = await tenantQuery<CatalogChoiceRow>(
    orgId,
    sku
      ? `SELECT sc.id, sc.sku, sc.product_title, COALESCE(sc.is_active, false) AS is_active,
                COALESCE(sc.is_provisional, false) AS is_provisional, NULLIF(BTRIM(sc.mpn), '') AS mpn,
                ${skuCatalogImageUrlSql('sc')} AS image_url
           FROM sku_catalog sc
          WHERE sc.organization_id = $1 AND UPPER(BTRIM(sc.sku)) = UPPER(BTRIM($2))
          LIMIT 1`
      : `WITH candidates AS (
           SELECT id, sku, product_title, COALESCE(is_active, false) AS is_active,
                  COALESCE(is_provisional, false) AS is_provisional,
                  upc, ean, gtin, NULLIF(BTRIM(mpn), '') AS mpn,
                  LOWER(CONCAT_WS(' ', sku, product_title, upc, ean, gtin, mpn)) AS search_text
             FROM sku_catalog
            WHERE organization_id = $1
         ), ranked AS (
           SELECT candidate.*,
                  match.term_count,
                  match.matched_terms,
                  match.term_score
             FROM candidates candidate
       CROSS JOIN LATERAL (
                  SELECT COUNT(*)::int AS term_count,
                         COUNT(*) FILTER (
                           WHERE candidate.search_text LIKE '%' || term || '%'
                              OR (LENGTH(term) >= 4
                                  AND word_similarity(term, candidate.search_text) >= 0.60)
                         )::int AS matched_terms,
                         COALESCE(AVG(GREATEST(
                           CASE WHEN candidate.search_text LIKE '%' || term || '%' THEN 1.0 ELSE 0.0 END,
                           CASE WHEN LENGTH(term) >= 4
                                THEN word_similarity(term, candidate.search_text)
                                ELSE 0.0 END
                         )), 0) AS term_score
                    FROM UNNEST($4::text[]) AS term
                  ) match
         )
         SELECT id, sku, product_title, is_active, is_provisional, mpn,
                -- Evaluated after ORDER BY / LIMIT: only the returned rows look up a photo.
                (SELECT ${skuCatalogImageUrlSql('sc')} FROM sku_catalog sc
                  WHERE sc.organization_id = $1 AND sc.id = ranked.id) AS image_url
           FROM ranked
          WHERE $2::text = ''
             OR sku ILIKE '%' || $2 || '%'
             OR product_title ILIKE '%' || $2 || '%'
             OR upc = $2 OR ean = $2 OR gtin = $2
             OR UPPER(mpn) = UPPER(BTRIM($2))
             OR (term_count > 0 AND matched_terms = term_count)
          ORDER BY CASE
                     WHEN UPPER(BTRIM(sku)) = UPPER(BTRIM($2)) THEN 0
                     WHEN UPPER(BTRIM(COALESCE(gtin, ''))) = UPPER(BTRIM($2))
                       OR BTRIM(COALESCE(upc, '')) = BTRIM($2)
                       OR BTRIM(COALESCE(ean, '')) = BTRIM($2) THEN 1
                     WHEN UPPER(COALESCE(mpn, '')) = UPPER(BTRIM($2)) THEN 2
                     WHEN UPPER(BTRIM(product_title)) = UPPER(BTRIM($2)) THEN 3
                     WHEN product_title ILIKE '%' || $2 || '%' THEN 4
                     ELSE 5
                   END,
                   term_score DESC,
                   is_active DESC,
                   product_title,
                   sku
          LIMIT $3`,
    sku ? [orgId, sku] : [orgId, q, limit, terms],
  );
  return rows.map(catalogChoiceOf);
}

type CatalogChoiceRow = {
  id: number;
  sku: string;
  product_title: string;
  is_active: boolean;
  is_provisional: boolean;
  mpn: string | null;
  image_url: string | null;
};

function catalogChoiceOf(row: CatalogChoiceRow): PrepackCatalogChoice {
  return {
    id: Number(row.id),
    sku: row.sku,
    title: row.product_title,
    mpn: row.mpn,
    isActive: row.is_active,
    isProvisional: row.is_provisional,
    imageUrl: row.image_url,
  };
}

type RelatedSku = { sku: string; product_title: string; category: string | null; notes: string | null };

function remoteSkuFor(partName: string, related: readonly RelatedSku[]): string | null {
  const words = partName.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  const ranked = related
    .map((row) => {
      const haystack = `${row.sku} ${row.product_title} ${row.category ?? ''} ${row.notes ?? ''}`.toLowerCase();
      const remote = /remote/.test(haystack) ? 20 : 0;
      const overlap = words.reduce((score, word) => score + (haystack.includes(word) ? 5 : 0), 0);
      const exactSku = partName.toLowerCase().includes(row.sku.toLowerCase()) ? 100 : 0;
      return { row, score: remote + overlap + exactSku };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.row.sku.localeCompare(b.row.sku));
  return ranked[0]?.row.sku ?? null;
}

export async function loadPrepackKit(
  orgId: OrgId,
  skuCatalogId: number,
  db?: Queryable,
): Promise<PrepackKit | null> {
  const query = <T extends QueryResultRow>(sql: string, params?: unknown[]) =>
    db ? db.query<T>(sql, params) : tenantQuery<T>(orgId, sql, params);
  const catalogResult = await query<CatalogChoiceRow & { catalog_photo_count: number }>(
    `SELECT sc.id, sc.sku, sc.product_title, COALESCE(sc.is_active, false) AS is_active,
            COALESCE(sc.is_provisional, false) AS is_provisional,
            NULLIF(BTRIM(sc.mpn), '') AS mpn,
            ${skuCatalogImageUrlSql('sc')} AS image_url,
            (SELECT COUNT(*)::int
               FROM photo_entity_links link
              WHERE link.organization_id = sc.organization_id
                AND link.entity_type = 'SKU' AND link.entity_id = sc.id) AS catalog_photo_count
       FROM sku_catalog sc WHERE sc.id = $1 AND sc.organization_id = $2 LIMIT 1`,
    [skuCatalogId, orgId],
  );
  const catalogRow = catalogResult.rows[0];
  if (!catalogRow) return null;

  const [partsResult, relatedResult] = await Promise.all([
    query<{
      id: number;
      component_name: string;
      component_type: string;
      qty_required: number;
    }>(
      `SELECT id, component_name, UPPER(component_type) AS component_type, qty_required
         FROM sku_kit_parts
        WHERE organization_id = $1 AND sku_catalog_id = $2
          AND UPPER(component_type) IN (${KIT_TYPES_SQL})
        ORDER BY sort_order, id`,
      [orgId, skuCatalogId],
    ),
    query<RelatedSku>(
      `SELECT child.sku, child.product_title, child.category, rel.notes
         FROM sku_relationships rel
         JOIN sku_catalog child
           ON child.id = rel.child_sku_id AND child.organization_id = rel.organization_id
        WHERE rel.organization_id = $1 AND rel.parent_sku_id = $2
        ORDER BY child.product_title, child.sku`,
      [orgId, skuCatalogId],
    ),
  ]);

  return {
    catalog: catalogChoiceOf(catalogRow),
    parts: partsResult.rows.map((row) => {
      const componentType = row.component_type as PrepackKitPartType;
      return {
        id: Number(row.id),
        componentName: row.component_name,
        componentType,
        qtyRequired: Math.max(1, Number(row.qty_required) || 1),
        componentSku:
          componentType === 'REMOTE' ? remoteSkuFor(row.component_name, relatedResult.rows) : null,
      };
    }),
    catalogPhotoCount: Number(catalogRow.catalog_photo_count) || 0,
  };
}

/**
 * Any serial unit the org owns, whatever stage it reached first — a serial
 * never seen at Unbox is a prepack fact too (`createPrepackUnit`). Shipped and
 * order-allocated units load so the form can refuse them by name.
 */
export async function loadPrepackUnit(
  orgId: OrgId,
  raw: string,
  db?: Queryable,
): Promise<PrepackUnit | null> {
  const key = unwrapScannedSerial(raw);
  if (!key) return null;
  // The existing QC product face falls back to `U-{OEM serial}` when the unit
  // has no minted uid. That is a unit barcode, not a second serial identity.
  const handleSerial = /^U-(.+)$/i.exec(key)?.[1]?.trim() || key;
  const query = <T extends QueryResultRow>(sql: string, params?: unknown[]) =>
    db ? db.query<T>(sql, params) : tenantQuery<T>(orgId, sql, params);
  const unitResult = await query<{
    id: number;
    serial_number: string;
    unit_uid: string | null;
    sku: string | null;
    sku_catalog_id: number | null;
    product_title: string | null;
    current_status: string;
    current_location: string | null;
    condition_grade: string | null;
    refurb_provenance: string | null;
    order_id: number | null;
    order_label: string | null;
    prepacked_at: string | null;
    prepacked_by_name: string | null;
    prepack_location_code: string | null;
    package_uid: string | null;
    package_serials: string[] | null;
  }>(
    `SELECT su.id, su.serial_number, su.unit_uid, su.sku, su.sku_catalog_id,
            sc.product_title, su.current_status::text AS current_status,
            su.current_location, su.condition_grade::text AS condition_grade,
            su.refurb_provenance,
            alloc.order_id, alloc.order_label,
            su.prepacked_at::text AS prepacked_at,
            packer.name AS prepacked_by_name,
            COALESCE(loc.barcode, loc.name, su.current_location) AS prepack_location_code,
            pkg.package_uid, pkg.package_serials
       FROM serial_units su
  LEFT JOIN sku_catalog sc
         ON sc.organization_id = su.organization_id
        AND sc.id = su.sku_catalog_id
  LEFT JOIN staff packer
         ON packer.organization_id = su.organization_id
        AND packer.id = su.prepacked_by_staff_id
  LEFT JOIN locations loc
         ON loc.organization_id = su.organization_id
        AND loc.id = su.prepack_location_id
  LEFT JOIN LATERAL (
         SELECT a.order_id, o.order_id AS order_label
           FROM order_unit_allocations a
      LEFT JOIN orders o ON o.id = a.order_id AND o.organization_id = a.organization_id
          WHERE a.organization_id = su.organization_id AND a.serial_unit_id = su.id
            AND a.state::text NOT IN ('RELEASED', 'RETURNED', 'SHIPPED')
          ORDER BY a.allocated_at DESC, a.id DESC LIMIT 1
       ) alloc ON TRUE
  LEFT JOIN LATERAL (
         SELECT lm.manifest_uid AS package_uid,
                ARRAY(
                  SELECT member.serial_number
                    FROM label_manifest_items member_item
                    JOIN serial_units member
                      ON member.id = member_item.serial_unit_id
                     AND member.organization_id = member_item.organization_id
                   WHERE member_item.organization_id = lm.organization_id
                     AND member_item.manifest_id = lm.id
                   ORDER BY member_item.ordinal, member_item.id
                ) AS package_serials
           FROM label_manifest_items item
           JOIN label_manifests lm
             ON lm.id = item.manifest_id AND lm.organization_id = item.organization_id
          WHERE item.organization_id = su.organization_id AND item.serial_unit_id = su.id
          LIMIT 1
       ) pkg ON TRUE
      WHERE su.organization_id = $1
        AND (
          su.normalized_serial = UPPER(BTRIM($2))
          OR su.normalized_serial = UPPER(BTRIM($3))
          OR su.unit_uid = BTRIM($2)
        )
      ORDER BY (su.unit_uid = BTRIM($2)) DESC,
               (su.normalized_serial = UPPER(BTRIM($2))) DESC
      LIMIT 1`,
    [orgId, key, handleSerial],
  );
  const row = unitResult.rows[0];
  if (!row) return null;
  const [contentsResult, evidence] = await Promise.all([
    query<{
      kit_part_id: number | null;
      component_name: string;
      component_type: PrepackKitPartType;
      qty_required: number;
      component_sku: string | null;
      included: boolean;
    }>(
      `SELECT kit_part_id, component_name, component_type, qty_required, component_sku, included
         FROM serial_unit_prepack_contents
        WHERE organization_id = $1 AND serial_unit_id = $2
        ORDER BY id`,
      [orgId, row.id],
    ),
    loadPrepackEvidence(orgId, Number(row.id), db),
  ]);
  return {
    id: Number(row.id),
    serialNumber: row.serial_number,
    unitUid: row.unit_uid,
    sku: row.sku,
    skuCatalogId: row.sku_catalog_id == null ? null : Number(row.sku_catalog_id),
    title: row.product_title,
    currentStatus: row.current_status,
    currentLocation: row.current_location,
    conditionGrade: row.condition_grade,
    refurbProvenance: parsePrepackProvenance(row.refurb_provenance),
    orderId: row.order_id == null ? null : Number(row.order_id),
    orderLabel: row.order_label,
    prepackedAt: row.prepacked_at,
    prepackedByName: row.prepacked_by_name,
    prepackLocationCode: row.prepack_location_code,
    packageUid: row.package_uid,
    packageSerials: row.package_serials ?? [],
    contents: contentsResult.rows.map((content): PrepackContentFact => ({
      id: content.kit_part_id == null ? 0 : Number(content.kit_part_id),
      componentName: content.component_name,
      componentType: content.component_type,
      qtyRequired: Number(content.qty_required),
      componentSku: content.component_sku,
      included: content.included,
    })),
    evidence,
  };
}

/**
 * A serial CycleForge has never seen, met first at prepack: created through
 * the canonical unit writer (`recordUnitEvent`, origin `manual`) as UNKNOWN,
 * stamped with the package's catalog product when one is chosen. Finish moves
 * it UNKNOWN → RECEIVED → STOCKED through the guarded state machine. An
 * existing serial is returned untouched (find-or-create).
 */
export async function createPrepackUnit(
  orgId: OrgId,
  input: { serial: string; skuCatalogId: number | null; actorStaffId: number | null },
): Promise<PrepackUnit | null> {
  const serial = unwrapScannedSerial(input.serial);
  if (!serial) return null;
  const existing = await loadPrepackUnit(orgId, serial);
  if (existing) return existing;
  await withTenantTransaction(orgId, async (client) => {
    const catalog = input.skuCatalogId
      ? (await client.query<{ id: number; sku: string }>(
          `SELECT id, sku FROM sku_catalog WHERE organization_id = $1 AND id = $2 LIMIT 1`,
          [orgId, input.skuCatalogId],
        )).rows[0] ?? null
      : null;
    await recordUnitEvent(
      {
        organizationId: orgId,
        serialNumber: serial,
        sku: catalog?.sku ?? null,
        skuCatalogId: catalog ? Number(catalog.id) : null,
        originSource: 'manual',
        targetStatus: 'UNKNOWN',
        eventType: 'NOTE',
        station: 'MOBILE',
        actorStaffId: input.actorStaffId,
        notes: 'Serial first seen at prepack',
        payload: { source: 'prepack' },
        writeTechSerial: false,
      },
      client,
    );
  });
  return loadPrepackUnit(orgId, serial);
}

/** Find is empty: the catalog products prepacked or received most recently, one row per product. */
export async function listRecentPrepackProducts(orgId: OrgId, limit = 20): Promise<PrepackCatalogChoice[]> {
  const { rows } = await tenantQuery<CatalogChoiceRow>(
    orgId,
    `WITH touched AS (
       SELECT su.sku_catalog_id, MAX(GREATEST(su.prepacked_at, su.received_at)) AS touched_at
         FROM serial_units su
        WHERE su.organization_id = $1
          AND su.sku_catalog_id IS NOT NULL
          AND (su.prepacked_at IS NOT NULL OR su.received_at IS NOT NULL)
        GROUP BY su.sku_catalog_id
        ORDER BY touched_at DESC
        LIMIT $2
     )
     SELECT sc.id, sc.sku, sc.product_title, COALESCE(sc.is_active, false) AS is_active,
            COALESCE(sc.is_provisional, false) AS is_provisional, NULLIF(BTRIM(sc.mpn), '') AS mpn,
            ${skuCatalogImageUrlSql('sc')} AS image_url
       FROM touched
       JOIN sku_catalog sc ON sc.id = touched.sku_catalog_id AND sc.organization_id = $1
      ORDER BY touched.touched_at DESC, sc.sku`,
    [orgId, Math.min(Math.max(limit, 1), 50)],
  );
  return rows.map(catalogChoiceOf);
}

/**
 * Typed prepack evidence on one unit: SERIAL_UNIT links to `prepack` photos,
 * counted by `photo_aspect`. Catalog (SKU) photos never count here.
 */
export async function loadPrepackEvidence(
  orgId: OrgId,
  serialUnitId: number,
  db?: Queryable,
): Promise<PrepackEvidence> {
  const query = <T extends QueryResultRow>(sql: string, params?: unknown[]) =>
    db ? db.query<T>(sql, params) : tenantQuery<T>(orgId, sql, params);
  const { rows } = await query<{ serial_n: number; condition_n: number; contents_n: number }>(
    `SELECT COUNT(*) FILTER (WHERE p.photo_aspect = 'serial')::int AS serial_n,
            COUNT(*) FILTER (
              WHERE p.photo_aspect IN ('condition', 'front', 'back', 'side', 'bottom')
            )::int AS condition_n,
            COUNT(*) FILTER (WHERE p.photo_aspect = 'included')::int AS contents_n
       FROM photo_entity_links link
       JOIN photos p ON p.id = link.photo_id AND p.organization_id = link.organization_id
      WHERE link.organization_id = $1
        AND link.entity_type = 'SERIAL_UNIT' AND link.entity_id = $2
        AND lower(COALESCE(p.photo_type, '')) = 'prepack'`,
    [orgId, serialUnitId],
  );
  const row = rows[0];
  return {
    serial: Number(row?.serial_n) || 0,
    condition: Number(row?.condition_n) || 0,
    contents: Number(row?.contents_n) || 0,
  };
}
