import 'server-only';

import type { QueryResultRow } from 'pg';
import { routeScan, unwrapScannedSerial } from '@/lib/barcode-routing';
import { QC_LABEL_INTERNAL_SERIAL_SQL_RE } from '@/lib/labels/qc-label-row';
import type { OrgId } from '@/lib/tenancy/constants';
import { skuCatalogImageUrlSql } from '@/lib/photos/sku-catalog-image-sql';
import { tenantQuery } from '@/lib/tenancy/db';
import { resolveSkuPaperworkManual } from '@/lib/manuals/order-manuals';
import {
  PREPACK_KIT_PART_TYPES,
  parsePrepackProvenance,
  type PrepackCatalogChoice,
  type PrepackContentFact,
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

/** The columns every prepack catalog read selects: `id, sku, product_title, image_url` (`skuCatalogImageUrlSql`). */
export type CatalogChoiceRow = {
  id: number;
  sku: string;
  product_title: string;
  image_url: string | null;
};

export function catalogChoiceOf(row: CatalogChoiceRow): PrepackCatalogChoice {
  return {
    id: Number(row.id),
    sku: row.sku,
    title: row.product_title,
    imageUrl: row.image_url,
  };
}

type RelatedSku = {
  id: number;
  sku: string;
  product_title: string;
  category: string | null;
  notes: string | null;
};

/**
 * The child SKU a part is paired to. `sku_kit_parts` carries no child link, so
 * the pairing is read off the parent → child edges: an edge whose notes name
 * the part (what `addPrepackKitPart` writes) wins outright, then the child SKU
 * spelled in the part name, then the part's type word and shared name words.
 */
function pairedChildSku(
  partName: string,
  partType: PrepackKitPartType,
  related: readonly RelatedSku[],
): string | null {
  const name = partName.trim().toLowerCase();
  const words = name.split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  const typeWord = partType.toLowerCase();
  const ranked = related
    .map((row) => {
      const haystack = `${row.sku} ${row.product_title} ${row.category ?? ''} ${row.notes ?? ''}`.toLowerCase();
      const named = row.notes?.trim().toLowerCase() === name ? 1000 : 0;
      const exactSku = name.includes(row.sku.toLowerCase()) ? 100 : 0;
      const typed = haystack.includes(typeWord) ? 20 : 0;
      const overlap = words.reduce((score, word) => score + (haystack.includes(word) ? 5 : 0), 0);
      return { row, score: named + exactSku + typed + overlap };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.row.sku.localeCompare(b.row.sku));
  return ranked[0]?.row.sku ?? null;
}

/** The product's pairing facts: parts list, paired child SKUs and the manual pack print reads at SKU level. */
export async function loadPrepackKit(
  orgId: OrgId,
  skuCatalogId: number,
  db?: Queryable,
): Promise<PrepackKit | null> {
  const query = <T extends QueryResultRow>(sql: string, params?: unknown[]) =>
    db ? db.query<T>(sql, params) : tenantQuery<T>(orgId, sql, params);
  const catalogResult = await query<CatalogChoiceRow>(
    `SELECT sc.id, sc.sku, sc.product_title, ${skuCatalogImageUrlSql('sc')} AS image_url
       FROM sku_catalog sc WHERE sc.id = $1 AND sc.organization_id = $2 LIMIT 1`,
    [skuCatalogId, orgId],
  );
  const catalogRow = catalogResult.rows[0];
  if (!catalogRow) return null;

  const [partsResult, relatedResult, manual] = await Promise.all([
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
      `SELECT child.id, child.sku, child.product_title, child.category, rel.notes
         FROM sku_relationships rel
         JOIN sku_catalog child
           ON child.id = rel.child_sku_id AND child.organization_id = rel.organization_id
        WHERE rel.organization_id = $1 AND rel.parent_sku_id = $2
        ORDER BY child.product_title, child.sku`,
      [orgId, skuCatalogId],
    ),
    resolveSkuPaperworkManual(query, orgId, skuCatalogId, catalogRow.sku),
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
        componentSku: pairedChildSku(row.component_name, componentType, relatedResult.rows),
      };
    }),
    children: relatedResult.rows.map((row) => ({
      id: Number(row.id),
      sku: row.sku,
      title: row.product_title,
    })),
    manual,
  };
}

/**
 * The unit a typed or scanned key names: its OEM serial, its minted
 * `unit_uid`, the `U-{OEM serial}` face of a unit with no uid, or — only for a
 * unit with no OEM serial (`AUTO-…` surrogate) — its `U-{id}` handle. A bare
 * number never names an id. Save resolves every package serial through this.
 */
export async function findPrepackUnitId(orgId: OrgId, raw: string, db?: Queryable): Promise<number | null> {
  const key = unwrapScannedSerial(raw);
  if (!key) return null;
  // The existing QC product face falls back to `U-{OEM serial}` when the unit
  // has no minted uid. That is a unit barcode, not a second serial identity.
  const handleSerial = /^U-(.+)$/i.exec(key)?.[1]?.trim() || key;
  const handleId = routeScan(raw)?.type === 'serial-unit' && /^\d{1,9}$/.test(key) ? Number(key) : null;
  const params = [orgId, key, handleSerial, handleId, QC_LABEL_INTERNAL_SERIAL_SQL_RE];
  const sql = `SELECT su.id FROM serial_units su
      WHERE su.organization_id = $1
        AND (
          su.normalized_serial = UPPER(BTRIM($2))
          OR su.normalized_serial = UPPER(BTRIM($3))
          OR su.unit_uid = BTRIM($2)
          OR (su.id = $4::int AND su.normalized_serial ~ $5)
        )
      ORDER BY (su.unit_uid = BTRIM($2)) IS TRUE DESC,
               (su.normalized_serial = UPPER(BTRIM($2))) DESC,
               (su.normalized_serial = UPPER(BTRIM($3))) DESC
      LIMIT 1`;
  const { rows } = db ? await db.query<{ id: number }>(sql, params) : await tenantQuery<{ id: number }>(orgId, sql, params);
  return rows[0] ? Number(rows[0].id) : null;
}

/**
 * Any serial unit the org owns, whatever stage it reached first. A serial
 * CycleForge has never seen answers null (save creates it). Shipped and
 * order-allocated units load so the form can refuse them by name.
 */
export async function loadPrepackUnit(
  orgId: OrgId,
  raw: string,
  db?: Queryable,
): Promise<PrepackUnit | null> {
  const unitId = await findPrepackUnitId(orgId, raw, db);
  if (unitId == null) return null;
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
      WHERE su.organization_id = $1 AND su.id = $2`,
    [orgId, unitId],
  );
  const row = unitResult.rows[0];
  if (!row) return null;
  const contentsResult = await query<{
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
  );
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
  };
}
