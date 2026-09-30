/** QC labels loader — every serial unit with a printed QC / pre-box label, org-scoped. */

import 'server-only';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveSkuIdentityTitle, skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';
import type { QcLabelView } from '@/lib/labels/qc-label-views';
import type { QcLabelPrintUnit, QcLabelRow } from '@/lib/labels/qc-label-row';
import { unwrapScannedSerial } from '@/lib/barcode-routing';

/** Rows painted per load; the footer says when the list is capped. */
export const QC_LABEL_ROW_CAP = 500;

/** The template the QC / pre-box unit sticker prints under (`post-multi-sn`, `PreboxWizard`). */
const QC_LABEL_TEMPLATE = 'product';

type DbRow = Omit<QcLabelRow, 'title'> & { catalog_product_title: string | null; zoho_item_title: string | null };

const VIEW_SQL: Readonly<Record<QcLabelView, string>> = {
  all: 'TRUE',
  stock: 'alloc.order_id IS NULL',
  order: 'alloc.order_id IS NOT NULL',
};

export async function listQcLabels(
  orgId: OrgId,
  opts: { view: QcLabelView; query: string | null },
): Promise<{ rows: QcLabelRow[]; totalCount: number }> {
  const q = opts.query?.trim() || null;
  const { rows } = await tenantQuery<DbRow & { total_count: number }>(
    orgId,
    `WITH printed AS (
       SELECT j.serial_unit_id,
              MIN(j.created_at) AS first_printed_at,
              MAX(j.created_at) AS last_printed_at,
              COUNT(*)::int AS print_count,
              COUNT(*) FILTER (WHERE j.is_reprint)::int AS reprint_count,
              (ARRAY_AGG(j.actor_staff_id ORDER BY j.created_at DESC))[1] AS last_actor
         FROM label_print_jobs j
        WHERE j.organization_id = $1
          AND j.template_id = $2
          AND j.serial_unit_id IS NOT NULL
        GROUP BY j.serial_unit_id
     )
     SELECT su.id AS serial_unit_id,
            su.unit_uid,
            su.serial_number,
            su.sku,
            sc.product_title AS catalog_product_title,
            (SELECT i.name FROM items i
              WHERE i.sku = su.sku AND i.organization_id = su.organization_id AND i.status = 'active'
              ORDER BY i.id LIMIT 1) AS zoho_item_title,
            su.condition_grade::text AS condition_grade,
            su.current_status::text AS current_status,
            COALESCE(loc.name, loc.barcode, su.current_location) AS location,
            qc.tested_by_name,
            to_char(qc.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS tested_at,
            to_char(p.first_printed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS first_printed_at,
            to_char(p.last_printed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_printed_at,
            p.print_count,
            p.reprint_count,
            printer.name AS last_printed_by_name,
            alloc.order_id,
            o.order_id AS order_label,
            alloc.state AS allocation_state,
            (alloc.order_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM tech_serial_numbers b
               WHERE b.organization_id = su.organization_id
                 AND b.order_id = alloc.order_id
                 AND (b.serial_unit_id = su.id OR UPPER(BTRIM(b.serial_number)) = su.normalized_serial)
            )) AS serial_on_order,
            COUNT(*) OVER ()::int AS total_count
       FROM printed p
       JOIN serial_units su ON su.id = p.serial_unit_id AND su.organization_id = $1
  LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('su')}
  LEFT JOIN staff printer ON printer.id = p.last_actor
  LEFT JOIN LATERAL (
         SELECT l.name, l.barcode FROM locations l
          WHERE l.organization_id = su.organization_id AND l.id::text = su.current_location
          LIMIT 1
       ) loc ON TRUE
  LEFT JOIN LATERAL (
         SELECT t.created_at, s.name AS tested_by_name
           FROM tech_serial_numbers t
      LEFT JOIN staff s ON s.id = t.tested_by
          WHERE t.organization_id = su.organization_id
            AND t.serial_unit_id = su.id
            AND t.order_id IS NULL
            AND t.tested_by IS NOT NULL
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT 1
       ) qc ON TRUE
  LEFT JOIN LATERAL (
         SELECT a.order_id, a.state::text AS state
           FROM order_unit_allocations a
          WHERE a.organization_id = su.organization_id
            AND a.serial_unit_id = su.id
            AND a.state::text NOT IN ('RELEASED', 'RETURNED')
          ORDER BY a.allocated_at DESC, a.id DESC
          LIMIT 1
       ) alloc ON TRUE
  LEFT JOIN orders o ON o.id = alloc.order_id AND o.organization_id = su.organization_id
      WHERE ${VIEW_SQL[opts.view]}
        AND ($3::text IS NULL
             OR su.normalized_serial ILIKE '%' || $3 || '%'
             OR su.unit_uid ILIKE '%' || $3 || '%'
             OR su.sku ILIKE '%' || $3 || '%'
             OR sc.product_title ILIKE '%' || $3 || '%'
             OR o.order_id ILIKE '%' || $3 || '%')
      ORDER BY p.last_printed_at DESC, su.id DESC
      LIMIT ${QC_LABEL_ROW_CAP}`,
    [orgId, QC_LABEL_TEMPLATE, q],
  );
  return {
    totalCount: rows[0]?.total_count ?? 0,
    rows: rows.map(({ catalog_product_title, zoho_item_title, total_count: _total, ...row }) => ({
      ...row,
      title: resolveSkuIdentityTitle({ catalog_product_title, zoho_item_title, sku: row.sku }) || row.sku || 'Unknown SKU',
    })),
  };
}

/**
 * The unit a print request names: the scanned QC label (unit_uid, GS1, `U-`)
 * or a typed serial. Never a bare id — a numeric serial must not print another
 * unit's sticker. `null` when no unit matches.
 */
export async function findQcLabelPrintUnit(orgId: OrgId, raw: string): Promise<QcLabelPrintUnit | null> {
  const key = unwrapScannedSerial(raw);
  if (!key) return null;
  const { rows } = await tenantQuery<Omit<QcLabelPrintUnit, 'title'> & { catalog_product_title: string | null; zoho_item_title: string | null }>(
    orgId,
    `SELECT su.id AS serial_unit_id, su.unit_uid, su.serial_number, su.sku,
            su.condition_grade::text AS condition_grade,
            sc.product_title AS catalog_product_title,
            (SELECT i.name FROM items i
              WHERE i.sku = su.sku AND i.organization_id = su.organization_id AND i.status = 'active'
              ORDER BY i.id LIMIT 1) AS zoho_item_title,
            EXISTS (SELECT 1 FROM label_print_jobs j
                     WHERE j.organization_id = su.organization_id AND j.serial_unit_id = su.id AND j.template_id = $3) AS printed
       FROM serial_units su
  LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('su')}
      WHERE su.organization_id = $1
        AND (su.normalized_serial = UPPER(BTRIM($2)) OR su.unit_uid = BTRIM($2))
      ORDER BY (su.normalized_serial = UPPER(BTRIM($2))) DESC
      LIMIT 1`,
    [orgId, key, QC_LABEL_TEMPLATE],
  );
  const row = rows[0];
  if (!row) return null;
  const { catalog_product_title, zoho_item_title, ...unit } = row;
  return {
    ...unit,
    title: resolveSkuIdentityTitle({ catalog_product_title, zoho_item_title, sku: unit.sku }) || unit.sku || 'Unknown SKU',
  };
}
