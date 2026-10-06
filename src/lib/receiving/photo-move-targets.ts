/** Move-photos carton-target search (server). */

import {
  parsePhotoMoveSearch,
  resolvePhotoMoveTargetTitle,
} from '@/lib/receiving/photo-move-targets-shared';
import { NOT_LISTING_PHOTO_SQL } from '@/lib/receiving/photo-intent';
import { UNBOX_OPENED_PREDICATE_SQL } from '@/lib/receiving/unbox-scan-opened-sql';
import { SKU_CATALOG_JOIN_ON_SQL } from '@/lib/sku/sku-identity-law';
import type { OrgId } from '@/lib/tenancy/constants';

export {
  parsePhotoMoveSearch,
  photoMoveTargetLabel,
  resolvePhotoMoveTargetTitle,
} from '@/lib/receiving/photo-move-targets-shared';

interface PhotoMoveTarget {
  receiving_id: number;
  po_id: string;
  po_number: string;
  /** Product / PO-group title for the picker row. */
  title: string;
  tracking_number: string | null;
  ticket_id: number | null;
  /** Provider-facing ticket id when linked (Zendesk #, …). */
  ticket_external_id: string | null;
  source: string | null;
  photo_count: number;
}

interface PhotoMoveTargetsResult {
  targets: PhotoMoveTarget[];
  /**
   * True when the needle matched only the excluded carton — results are the
   * recent-browse fallback so the picker never dead-ends on “this carton”.
   */
  matchedExcludedSelf: boolean;
}

interface SearchPhotoMoveTargetsArgs {
  orgId: OrgId;
  search: string;
  /** Drop this carton from results (Move photos is always relative to another). */
  excludeReceivingId?: number | null;
  limit?: number;
}

type TargetRow = {
  receiving_id: number | string;
  po_id: string | null;
  po_number: string | null;
  catalog_product_title: string | null;
  zoho_item_title: string | null;
  item_name: string | null;
  sku: string | null;
  zoho_item_id: string | null;
  tracking_number: string | null;
  ticket_id: number | string | null;
  ticket_external_id: string | null;
  source: string | null;
  photo_count: number | string | null;
};

export interface SearchPhotoMoveTargetsDeps {
  query: (orgId: OrgId, sql: string, values: unknown[]) => Promise<TargetRow[]>;
}

/** Carton photo-count subquery — keep in lock-step with `sqlReceivingPhotoCount` in `@/lib/photos/queries/receiving-list`. */
function photoCountSql(receivingIdExpr: string, orgIdExpr: string): string {
  return `(SELECT COUNT(DISTINCT p.id)
     FROM photos p
     INNER JOIN photo_entity_links l ON l.photo_id = p.id AND l.organization_id = p.organization_id
     LEFT JOIN receiving_line rl_ph
            ON l.entity_type = 'RECEIVING_LINE' AND rl_ph.id = l.entity_id
    WHERE p.organization_id = ${orgIdExpr}
      AND ${receivingIdExpr} IS NOT NULL
      AND ${NOT_LISTING_PHOTO_SQL}
      AND (
        (l.entity_type = 'RECEIVING' AND l.entity_id = ${receivingIdExpr})
        OR (l.entity_type = 'RECEIVING_LINE' AND rl_ph.receiving_id = ${receivingIdExpr})
      ))`;
}

function mapRow(row: TargetRow): PhotoMoveTarget {
  const po_number = String(row.po_number || '');
  const source = (row.source as string | null) ?? null;
  return {
    receiving_id: Number(row.receiving_id),
    po_id: String(row.po_id || ''),
    po_number,
    title: resolvePhotoMoveTargetTitle({
      catalog_product_title: row.catalog_product_title,
      zoho_item_title: row.zoho_item_title,
      item_name: row.item_name,
      sku: row.sku,
      zoho_item_id: row.zoho_item_id,
    }),
    tracking_number: (row.tracking_number as string | null) ?? null,
    ticket_id: row.ticket_id != null ? Number(row.ticket_id) : null,
    ticket_external_id: row.ticket_external_id
      ? String(row.ticket_external_id).trim() || null
      : null,
    source,
    photo_count: Number(row.photo_count ?? 0),
  };
}

async function defaultQuery(
  orgId: OrgId,
  sql: string,
  values: unknown[],
): Promise<TargetRow[]> {
  const { tenantQuery } = await import('@/lib/tenancy/db');
  const result = await tenantQuery<TargetRow>(orgId, sql, values);
  return result.rows;
}

interface QueryTargetsArgs {
  orgId: OrgId;
  search: string;
  /** Drop this carton from results. */
  excludeReceivingId?: number | null;
  /**
   * Constrain to this single carton (self-match probe). Mutually exclusive
   * with `excludeReceivingId` in practice — probe uses onlyReceivingId alone.
   */
  onlyReceivingId?: number | null;
  limit: number;
}

/**
 * Build + run one carton-target query. Shared by filtered search, self-match
 * probe (`onlyReceivingId`), and empty browse.
 */
async function queryTargets(
  args: QueryTargetsArgs,
  deps: SearchPhotoMoveTargetsDeps,
): Promise<PhotoMoveTarget[]> {
  const intent = parsePhotoMoveSearch(args.search);
  const exclude =
    args.excludeReceivingId != null &&
    Number.isFinite(args.excludeReceivingId) &&
    args.excludeReceivingId > 0
      ? args.excludeReceivingId
      : null;
  const onlyId =
    args.onlyReceivingId != null &&
    Number.isFinite(args.onlyReceivingId) &&
    args.onlyReceivingId > 0
      ? args.onlyReceivingId
      : null;

  const values: unknown[] = [args.orgId];
  let idx = 2;
  const conditions: string[] = [`r.organization_id = $1`];

  if (onlyId != null) {
    conditions.push(`r.id = $${idx}`);
    values.push(onlyId);
    idx++;
  } else if (exclude != null) {
    conditions.push(`r.id <> $${idx}`);
    values.push(exclude);
    idx++;
  }

  if (intent.receivingId != null) {
    conditions.push(`r.id = $${idx}`);
    values.push(intent.receivingId);
    idx++;
  } else if (intent.ticketId != null && intent.pattern == null) {
    // `#232` — exact ticket only.
    conditions.push(`EXISTS (
      SELECT 1
        FROM ticket_links tl
        JOIN support_tickets st
          ON st.id = tl.support_ticket_id
         AND st.organization_id = tl.organization_id
       WHERE tl.organization_id = r.organization_id
         AND st.id = $${idx}
         AND (
           (tl.entity_type = 'RECEIVING' AND tl.entity_id = r.id)
           OR (tl.entity_type = 'SHIPMENT'
               AND r.shipment_id IS NOT NULL
               AND tl.entity_id = r.shipment_id)
           OR (tl.entity_type = 'RECEIVING_LINE' AND EXISTS (
                 SELECT 1 FROM receiving_line rl_t
                  WHERE rl_t.id = tl.entity_id
                    AND rl_t.receiving_id = r.id
                    AND rl_t.organization_id = r.organization_id
               ))
         )
    )`);
    values.push(intent.ticketId);
    idx++;
  } else if (intent.pattern != null) {
    const patternIdx = idx;
    values.push(intent.pattern);
    idx++;

    const ticketExactClause =
      intent.ticketId != null
        ? `OR st.id = $${idx}`
        : '';
    if (intent.ticketId != null) {
      values.push(intent.ticketId);
      idx++;
    }

    conditions.push(`(
      COALESCE(stn.tracking_number_raw, '') ILIKE $${patternIdx}
      OR COALESCE(stn.tracking_number_normalized, '') ILIKE $${patternIdx}
      OR COALESCE(r.zoho_purchaseorder_number, '') ILIKE $${patternIdx}
      OR COALESCE(r.zoho_purchaseorder_id, '') ILIKE $${patternIdx}
      OR EXISTS (
        SELECT 1
          FROM shipment_links sl
          JOIN shipping_tracking_numbers stn2 ON stn2.id = sl.shipment_id
         WHERE sl.organization_id = r.organization_id
           AND sl.owner_type = 'RECEIVING'
           AND sl.owner_id = r.id
           AND (
             COALESCE(stn2.tracking_number_raw, '') ILIKE $${patternIdx}
             OR COALESCE(stn2.tracking_number_normalized, '') ILIKE $${patternIdx}
           )
      )
      OR EXISTS (
        SELECT 1
          FROM receiving_line rl
          LEFT JOIN receiving_line_zoho rz
            ON rz.receiving_line_id = rl.id
           AND rz.organization_id = rl.organization_id
          LEFT JOIN sku_catalog sc ON ${SKU_CATALOG_JOIN_ON_SQL}
         WHERE rl.receiving_id = r.id
           AND rl.organization_id = r.organization_id
           AND (
             COALESCE(rz.zoho_purchaseorder_number, '') ILIKE $${patternIdx}
             OR COALESCE(rz.zoho_purchaseorder_id, '') ILIKE $${patternIdx}
             OR COALESCE(rl.sku, '') ILIKE $${patternIdx}
             OR COALESCE(rl.item_name, '') ILIKE $${patternIdx}
             OR COALESCE(sc.product_title, '') ILIKE $${patternIdx}
             OR EXISTS (
               SELECT 1 FROM items i
                WHERE i.zoho_item_id = rz.zoho_item_id
                  AND i.status = 'active'
                  AND COALESCE(i.name, '') ILIKE $${patternIdx}
             )
           )
      )
      OR EXISTS (
        SELECT 1
          FROM ticket_links tl
          JOIN support_tickets st
            ON st.id = tl.support_ticket_id
           AND st.organization_id = tl.organization_id
         WHERE tl.organization_id = r.organization_id
           AND (
             (tl.entity_type = 'RECEIVING' AND tl.entity_id = r.id)
             OR (tl.entity_type = 'SHIPMENT'
                 AND r.shipment_id IS NOT NULL
                 AND tl.entity_id = r.shipment_id)
             OR (tl.entity_type = 'RECEIVING_LINE' AND EXISTS (
                   SELECT 1 FROM receiving_line rl_t
                    WHERE rl_t.id = tl.entity_id
                      AND rl_t.receiving_id = r.id
                      AND rl_t.organization_id = r.organization_id
                 ))
           )
           AND (
             COALESCE(st.external_ticket_id, '') ILIKE $${patternIdx}
             OR COALESCE(st.subject_cache, '') ILIKE $${patternIdx}
             ${ticketExactClause}
           )
      )
    )`);
  }
  // Empty search (no exact-id / ticket / pattern) → Unboxed-rail browse:
  // same membership + first-open order as view=unbox_opened so Recent cartons
  // show product titles like the sidebar, not triage stubs by updated_at.
  const isUnboxBrowse =
    onlyId == null &&
    intent.receivingId == null &&
    intent.ticketId == null &&
    intent.pattern == null;
  if (isUnboxBrowse) {
    conditions.push(UNBOX_OPENED_PREDICATE_SQL);
  }

  values.push(args.limit);
  const limitIdx = idx;

  /** Prefer a line with real product identity over an early `'Unfound PO'` stub (ORDER BY rl.id alone often picked the placeholder). */
  const productLineOrder = `
    CASE
      WHEN (
        SELECT name FROM items
         WHERE zoho_item_id = rz.zoho_item_id AND status = 'active'
         LIMIT 1
      ) IS NOT NULL THEN 0
      WHEN COALESCE(sc.product_title, '') <> '' THEN 1
      WHEN COALESCE(rl.item_name, '') <> ''
       AND rl.item_name <> 'Unfound PO' THEN 2
      WHEN COALESCE(rl.sku, '') <> '' THEN 3
      WHEN COALESCE(rz.zoho_item_id, '') <> '' THEN 4
      ELSE 5
    END,
    rl.id`;

  const orderBySql = isUnboxBrowse
    ? `COALESCE(ru.opened_at, unbox_open.unbox_opened_at, r.updated_at) DESC NULLS LAST, r.id DESC`
    : `r.updated_at DESC NULLS LAST, r.id DESC`;

  const unboxBrowseJoins = isUnboxBrowse
    ? `
    LEFT JOIN receiving_unbox ru
      ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
    LEFT JOIN LATERAL (
      SELECT MAX(oe_uo.occurred_at) AS unbox_opened_at
        FROM ops_events oe_uo
       WHERE oe_uo.organization_id = r.organization_id
         AND oe_uo.entity_type = 'receiving'
         AND oe_uo.entity_id = r.id
         AND oe_uo.event_type = 'UNBOX_SCAN_OPENED'
    ) unbox_open ON true`
    : '';

  const sql = `
    SELECT
      r.id AS receiving_id,
      COALESCE(
        (
          SELECT rz.zoho_purchaseorder_id
            FROM receiving_line rl
            JOIN receiving_line_zoho rz
              ON rz.receiving_line_id = rl.id
             AND rz.organization_id = rl.organization_id
           WHERE rl.receiving_id = r.id
             AND rl.organization_id = r.organization_id
             AND rz.zoho_purchaseorder_id IS NOT NULL
           ORDER BY rl.id
           LIMIT 1
        ),
        r.zoho_purchaseorder_id,
        ''
      ) AS po_id,
      COALESCE(
        (
          SELECT rz.zoho_purchaseorder_number
            FROM receiving_line rl
            JOIN receiving_line_zoho rz
              ON rz.receiving_line_id = rl.id
             AND rz.organization_id = rl.organization_id
           WHERE rl.receiving_id = r.id
             AND rl.organization_id = r.organization_id
             AND COALESCE(rz.zoho_purchaseorder_number, '') <> ''
           ORDER BY rl.id
           LIMIT 1
        ),
        r.zoho_purchaseorder_number,
        ''
      ) AS po_number,
      (
        SELECT sc.product_title
          FROM receiving_line rl
          LEFT JOIN receiving_line_zoho rz
            ON rz.receiving_line_id = rl.id
           AND rz.organization_id = rl.organization_id
          LEFT JOIN sku_catalog sc ON ${SKU_CATALOG_JOIN_ON_SQL}
         WHERE rl.receiving_id = r.id
           AND rl.organization_id = r.organization_id
         ORDER BY ${productLineOrder}
         LIMIT 1
      ) AS catalog_product_title,
      (
        SELECT (
                 SELECT name FROM items
                  WHERE zoho_item_id = rz.zoho_item_id AND status = 'active'
                  LIMIT 1
               )
          FROM receiving_line rl
          LEFT JOIN receiving_line_zoho rz
            ON rz.receiving_line_id = rl.id
           AND rz.organization_id = rl.organization_id
          LEFT JOIN sku_catalog sc ON ${SKU_CATALOG_JOIN_ON_SQL}
         WHERE rl.receiving_id = r.id
           AND rl.organization_id = r.organization_id
         ORDER BY ${productLineOrder}
         LIMIT 1
      ) AS zoho_item_title,
      (
        SELECT rl.item_name
          FROM receiving_line rl
          LEFT JOIN receiving_line_zoho rz
            ON rz.receiving_line_id = rl.id
           AND rz.organization_id = rl.organization_id
          LEFT JOIN sku_catalog sc ON ${SKU_CATALOG_JOIN_ON_SQL}
         WHERE rl.receiving_id = r.id
           AND rl.organization_id = r.organization_id
           AND COALESCE(rl.item_name, '') <> ''
           AND rl.item_name <> 'Unfound PO'
         ORDER BY ${productLineOrder}
         LIMIT 1
      ) AS item_name,
      (
        SELECT rl.sku
          FROM receiving_line rl
          LEFT JOIN receiving_line_zoho rz
            ON rz.receiving_line_id = rl.id
           AND rz.organization_id = rl.organization_id
          LEFT JOIN sku_catalog sc ON ${SKU_CATALOG_JOIN_ON_SQL}
         WHERE rl.receiving_id = r.id
           AND rl.organization_id = r.organization_id
           AND COALESCE(rl.sku, '') <> ''
         ORDER BY ${productLineOrder}
         LIMIT 1
      ) AS sku,
      (
        SELECT rz.zoho_item_id
          FROM receiving_line rl
          JOIN receiving_line_zoho rz
            ON rz.receiving_line_id = rl.id
           AND rz.organization_id = rl.organization_id
          LEFT JOIN sku_catalog sc ON ${SKU_CATALOG_JOIN_ON_SQL}
         WHERE rl.receiving_id = r.id
           AND rl.organization_id = r.organization_id
           AND COALESCE(rz.zoho_item_id, '') <> ''
         ORDER BY ${productLineOrder}
         LIMIT 1
      ) AS zoho_item_id,
      stn.tracking_number_raw AS tracking_number,
      (
        SELECT tl.support_ticket_id
          FROM ticket_links tl
         WHERE tl.organization_id = r.organization_id
           AND (
             (tl.entity_type = 'RECEIVING' AND tl.entity_id = r.id)
             OR (tl.entity_type = 'SHIPMENT'
                 AND r.shipment_id IS NOT NULL
                 AND tl.entity_id = r.shipment_id)
           )
         ORDER BY
           CASE WHEN tl.entity_type = 'RECEIVING' THEN 0 ELSE 1 END,
           tl.is_primary DESC,
           tl.id
         LIMIT 1
      ) AS ticket_id,
      (
        SELECT st.external_ticket_id
          FROM ticket_links tl
          JOIN support_tickets st
            ON st.id = tl.support_ticket_id
           AND st.organization_id = tl.organization_id
         WHERE tl.organization_id = r.organization_id
           AND (
             (tl.entity_type = 'RECEIVING' AND tl.entity_id = r.id)
             OR (tl.entity_type = 'SHIPMENT'
                 AND r.shipment_id IS NOT NULL
                 AND tl.entity_id = r.shipment_id)
           )
         ORDER BY
           CASE WHEN tl.entity_type = 'RECEIVING' THEN 0 ELSE 1 END,
           tl.is_primary DESC,
           tl.id
         LIMIT 1
      ) AS ticket_external_id,
      r.source,
      ${photoCountSql('r.id', '$1')}::int AS photo_count
    FROM receiving_carton r
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
    ${unboxBrowseJoins}
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${orderBySql}
    LIMIT $${limitIdx}
  `;

  const rows = await deps.query(args.orgId, sql, values);
  return rows
    .map(mapRow)
    .filter((r) => Number.isFinite(r.receiving_id) && r.receiving_id > 0);
}

/** Search receiving cartons eligible as Move-photos targets. */
export async function searchReceivingPhotoMoveTargets(
  args: SearchPhotoMoveTargetsArgs,
  deps: SearchPhotoMoveTargetsDeps = { query: defaultQuery },
): Promise<PhotoMoveTargetsResult> {
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);
  const needle = String(args.search || '').trim();
  const exclude =
    args.excludeReceivingId != null &&
    Number.isFinite(args.excludeReceivingId) &&
    args.excludeReceivingId > 0
      ? args.excludeReceivingId
      : null;

  const targets = await queryTargets(
    {
      orgId: args.orgId,
      search: args.search,
      excludeReceivingId: exclude,
      limit,
    },
    deps,
  );

  if (targets.length > 0 || !needle || exclude == null) {
    return { targets, matchedExcludedSelf: false };
  }

  // Empty filtered hit with a needle — did we only exclude the match?
  const selfHits = await queryTargets(
    {
      orgId: args.orgId,
      search: args.search,
      onlyReceivingId: exclude,
      limit: 1,
    },
    deps,
  );
  if (selfHits.length === 0) {
    return { targets: [], matchedExcludedSelf: false };
  }

  const recent = await queryTargets(
    {
      orgId: args.orgId,
      search: '',
      excludeReceivingId: exclude,
      limit,
    },
    deps,
  );
  return { targets: recent, matchedExcludedSelf: true };
}
