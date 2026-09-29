/**
 * Order **exceptions** — one list of the orders that cannot ship yet, and why.
 * Operator brief (2026-08-31): "I only care about my order and linking it, so
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { PICKUP_FULFILLMENT_CHANNEL, evaluateReleaseGates } from './release-gates';
import { exceptionHeldSql, sqlOrderInExceptionQueue } from './exception-membership';
import { buyerNoteUnacknowledgedSql } from './buyer-note-interlock';
import {
  ORDER_EXCEPTION_CATEGORIES,
  deriveOrderExceptionBlockers,
  resolveOrderExceptionRouting,
  type OrderExceptionCategory,
  type OrderExceptionRow,
  type OrderExceptionScope,
} from './order-exception-types';
// Re-exported so server callers keep one import site; client components must
// import from `./order-exception-types` directly (this module reaches the DB).
export {
  ORDER_EXCEPTION_BLOCKER_LABEL,
  ORDER_EXCEPTION_CATEGORIES,
  deriveOrderExceptionBlockers,
} from './order-exception-types';
export type {
  OrderExceptionBlocker,
  OrderExceptionCategory,
  OrderExceptionRow,
  OrderExceptionScope,
} from './order-exception-types';

interface RawExceptionRow {
  id: number | string;
  order_id: string | null;
  item_number: string | null;
  sku: string | null;
  product_title: string | null;
  quantity: string | null;
  condition: string | null;
  account_source: string | null;
  release_state: string | null;
  docs_not_required: boolean | null;
  fulfillment_channel: string | null;
  tracking_number: string | null;
  sku_catalog_id: number | string | null;
  catalog_title: string | null;
  catalog_sku: string | null;
  linked_document_count: number | string | null;
  shipping_label_linked: boolean | null;
  shipping_label_purchased: boolean | null;
  sibling_unpaired_count: number | string | null;
  exception_category: string | null;
  responsible_person: string | null;
  buyer_note: string | null;
  internal_note: string | null;
}

/** Document + label existence, phrased exactly as `caged-orders.ts` phrases them so an order's G2/G3 answer is identical on both surfaces. */
const G2_DOCUMENT_COUNT_SQL = `(
  SELECT COUNT(*)::int
    FROM documents d
   WHERE d.organization_id = o.organization_id
     AND COALESCE(d.document_type, '') <> 'shipping_label'
     AND EXISTS (
       SELECT 1 FROM document_entity_links l
        WHERE l.document_id = d.id
          AND l.organization_id = o.organization_id
          AND (
            (l.entity_type = 'ORDER' AND l.entity_id = o.id)
            OR (o.sku_catalog_id IS NOT NULL
                AND l.entity_type = 'SKU'
                AND l.entity_id = o.sku_catalog_id)
          )
     )
)`;

const G3_LABEL_EXISTS_SQL = `EXISTS (
  SELECT 1 FROM documents d
   WHERE d.organization_id = o.organization_id
     AND (
       (d.document_type = 'shipping_label' AND EXISTS (
          SELECT 1 FROM document_entity_links l
           WHERE l.document_id = d.id
             AND l.organization_id = o.organization_id
             AND l.entity_type = 'ORDER'
             AND l.entity_id = o.id
        ))
       OR (d.entity_type = 'SHIPPING_LABEL' AND d.entity_id = o.id)
     )
)`;

const G3_LABEL_PURCHASED_SQL = `EXISTS (
  SELECT 1 FROM documents d
    JOIN document_entity_links l
      ON l.document_id = d.id
     AND l.organization_id = o.organization_id
     AND l.entity_type = 'ORDER'
     AND l.entity_id = o.id
   WHERE d.organization_id = o.organization_id
     AND d.document_type = 'shipping_label'
     AND COALESCE(d.document_data->>'source', '') IN ('shipstation_api', 'marketplace_api')
)`;

/** Other unpaired orders sharing this item number — the pair-once fan-out size. */
const SIBLING_UNPAIRED_SQL = `(
  SELECT COUNT(*)::int FROM orders o2
   WHERE o2.organization_id = o.organization_id
     AND o2.id <> o.id
     AND o2.sku_catalog_id IS NULL
     AND NULLIF(TRIM(COALESCE(o2.item_number, '')), '') IS NOT NULL
     AND NULLIF(TRIM(COALESCE(o2.item_number, '')), '')
       = NULLIF(TRIM(COALESCE(o.item_number, '')), '')
)`;

function parseExceptionCategory(value: string | null): OrderExceptionCategory | null {
  return ORDER_EXCEPTION_CATEGORIES.includes(value as OrderExceptionCategory)
    ? (value as OrderExceptionCategory)
    : null;
}

function mapRow(row: RawExceptionRow): OrderExceptionRow {
  const skuCatalogId = row.sku_catalog_id == null ? null : Number(row.sku_catalog_id);
  const linkedDocumentCount = Number(row.linked_document_count ?? 0);
  const blockers = deriveOrderExceptionBlockers({
    itemNumber: row.item_number,
    skuCatalogId,
  });
  return {
    id: Number(row.id),
    orderNumber: row.order_id,
    itemNumber: row.item_number,
    sku: row.sku,
    productTitle: row.product_title,
    quantity: row.quantity,
    condition: row.condition,
    accountSource: row.account_source,
    trackingNumber: row.tracking_number,
    releaseState: row.release_state,
    skuCatalogId,
    catalogTitle: row.catalog_title,
    catalogSku: row.catalog_sku,
    siblingUnpairedCount: Number(row.sibling_unpaired_count ?? 0),
    blockers,
    routing: resolveOrderExceptionRouting(blockers, { category: parseExceptionCategory(row.exception_category) }),
    responsiblePerson: row.responsible_person,
    buyerNote: row.buyer_note,
    internalNote: row.internal_note,
    gates: evaluateReleaseGates({
      orderNumber: row.order_id,
      itemNumber: row.item_number,
      trackingNumber: row.tracking_number,
      linkedDocumentCount,
      docsNotRequired: row.docs_not_required === true,
      shippingLabelLinked: row.shipping_label_linked === true,
      shippingLabelPurchased: row.shipping_label_purchased === true,
      skuCatalogId,
      pickup: row.fulfillment_channel === PICKUP_FULFILLMENT_CHANNEL,
    }),
  };
}

/**
 * The ONE exception-category expression — the list's column, its `?category=`
 * filter and the nav facet counts all read it. Deliberately explicit: missing
 * facts are not silently promoted into a new exception class. Expects `o` =
 * orders and `stn` = its shipping_tracking_numbers join.
 */
export const ORDER_EXCEPTION_CATEGORY_SQL = `CASE
      WHEN o.is_out_of_stock THEN 'Out of Stock'
      WHEN ${buyerNoteUnacknowledgedSql('o')} THEN 'Buyer Request'
      WHEN COALESCE(stn.has_exception, false) THEN 'Shipping Issue'
      WHEN ${exceptionHeldSql('o')} THEN 'SKU Mapping'
      ELSE 'Other'
    END`;

const EXCEPTION_SELECT = `
  SELECT
    o.id,
    o.order_id,
    o.item_number,
    o.sku,
    o.product_title,
    o.quantity,
    o.condition,
    o.account_source,
    o.release_state,
    o.docs_not_required,
    o.fulfillment_channel,
    o.sku_catalog_id,
    sc.product_title AS catalog_title,
    sc.sku           AS catalog_sku,
    NULLIF(TRIM(COALESCE(stn.tracking_number_raw, '')), '') AS tracking_number,
    ${ORDER_EXCEPTION_CATEGORY_SQL} AS exception_category,
    assignment.responsible_person,
    NULLIF(TRIM(COALESCE(o.buyer_note, '')), '') AS buyer_note,
    NULLIF(TRIM(COALESCE(o.notes, '')), '') AS internal_note,
    ${G2_DOCUMENT_COUNT_SQL} AS linked_document_count,
    ${G3_LABEL_EXISTS_SQL}   AS shipping_label_linked,
    ${G3_LABEL_PURCHASED_SQL} AS shipping_label_purchased,
    ${SIBLING_UNPAIRED_SQL}  AS sibling_unpaired_count
  FROM orders o
  LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
  LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
                          AND sc.organization_id = o.organization_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(tester.name, packer.name) AS responsible_person
      FROM work_assignments wa
      LEFT JOIN staff tester ON tester.id = wa.assigned_tech_id
      LEFT JOIN staff packer ON packer.id = wa.assigned_packer_id
     WHERE wa.organization_id = o.organization_id
       AND wa.entity_type = 'ORDER'
       AND wa.entity_id = o.id
       AND wa.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
     ORDER BY wa.updated_at DESC NULLS LAST, wa.created_at DESC
     LIMIT 1
  ) assignment ON TRUE
`;

/**
 * Queue membership for a scope — the ONE predicate the list, the desk-sidebar
 * count and the nav facets read, so a badge cannot disagree with the rows.
 * Expects `o` = orders and `stn` = its shipping_tracking_numbers join; `$1` = org.
 */
export function exceptionScopeWhere(scope: OrderExceptionScope): string {
  let where = `WHERE o.organization_id = $1
    AND ${sqlOrderInExceptionQueue('o', 'stn')}`;
  if (scope === 'all') {
    where += `
      AND NOT EXISTS (
        SELECT 1 FROM station_activity_logs sal
         WHERE sal.shipment_id = o.shipment_id
           AND sal.organization_id = o.organization_id
           AND sal.activity_type = 'SHIP_CONFIRM'
      )`;
  }
  return where;
}

/** `?q=` over the exception queue; `likeParam` binds `%<lowercased query>%`. */
export function exceptionSearchSql(likeParam: string): string {
  if (!/^\$[1-9][0-9]*$/.test(likeParam)) throw new Error(`invalid SQL param ref: ${likeParam}`);
  return `(
        LOWER(COALESCE(o.order_id, '')) LIKE ${likeParam}
        OR LOWER(COALESCE(o.item_number, '')) LIKE ${likeParam}
        OR LOWER(COALESCE(o.sku, '')) LIKE ${likeParam}
        OR LOWER(COALESCE(o.product_title, '')) LIKE ${likeParam}
      )`;
}

/** How many orders the exception queue holds for `scope` — uncapped, no search/category. */
export async function countOrderExceptions(
  orgId: OrgId,
  scope: OrderExceptionScope = 'actionable',
): Promise<number> {
  const res = await tenantQuery<{ n: number }>(
    orgId,
    `SELECT COUNT(*)::int AS n
       FROM orders o
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
     ${exceptionScopeWhere(scope)}`,
    [orgId],
  );
  return Number(res.rows[0]?.n) || 0;
}

/** The exception queue. */
export async function listOrderExceptions(
  orgId: OrgId,
  options: {
    scope?: OrderExceptionScope;
    limit?: number;
    search?: string;
    category?: OrderExceptionCategory | null;
  } = {},
): Promise<OrderExceptionRow[]> {
  const limit = Math.min(Math.max(Number(options.limit) || 200, 1), 500);
  const scope: OrderExceptionScope = options.scope === 'all' ? 'all' : 'actionable';
  const search = (options.search ?? '').trim();
  const category = options.category && ORDER_EXCEPTION_CATEGORIES.includes(options.category)
    ? options.category
    : null;

  const params: unknown[] = [orgId];
  let where = exceptionScopeWhere(scope);

  if (category) {
    params.push(category);
    where += ` AND (${ORDER_EXCEPTION_CATEGORY_SQL}) = $${params.length}`;
  }

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where += ` AND ${exceptionSearchSql(`$${params.length}`)}`;
  }

  params.push(limit);
  const res = await tenantQuery<RawExceptionRow>(
    orgId,
    `${EXCEPTION_SELECT} ${where}
      ORDER BY
        (COALESCE(o.release_state, '') = 'caged') DESC,
        CASE WHEN NULLIF(TRIM(COALESCE(o.item_number, '')), '') IS NULL THEN 0 ELSE 1 END ASC,
        ${SIBLING_UNPAIRED_SQL} DESC,
        o.id DESC
      LIMIT $${params.length}`,
    params,
  );
  return res.rows.map(mapRow);
}

/** One exception row — the editor's read-after-write. */
export async function getOrderException(
  orgId: OrgId,
  orderId: number,
): Promise<OrderExceptionRow | null> {
  const res = await tenantQuery<RawExceptionRow>(
    orgId,
    `${EXCEPTION_SELECT} WHERE o.organization_id = $1 AND o.id = $2 LIMIT 1`,
    [orgId, orderId],
  );
  const row = res.rows[0];
  return row ? mapRow(row) : null;
}
