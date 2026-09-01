/**
 * Order **exceptions** — one list of the orders that cannot ship yet, and why.
 *
 * Operator brief (2026-08-31): "I only care about my order and linking it, so
 * it's not an exception within the system." That sentence is the model. The
 * row is an ORDER, the blockers are the reasons it is stuck, and the work is
 * done until there are no reasons left.
 *
 * ## Blockers, not gates
 *
 * G1–G4 (`evaluateReleaseGates`) answer "may this be released"; they are the
 * release contract and stay exactly as they are — this module never re-derives
 * them, it calls them. But the gates are coarse for triage: G1 fails as one
 * unit whether the item number or the tracking is missing. So a blocker is
 * the finer-grained, actionable phrasing: each one names a single missing
 * fact and maps to a single control.
 *
 * ~~PAIRING is not a gate at all~~ — struck 2026-08-31 by the order-flow
 * ruling (R-FLOW-1, `docs/warehouse-os/PLAN-order-flow-spine-3h.md` §2):
 * pairing is now gate **G4**, and `unpaired` is its blocker twin. The
 * observation that motivated the strike stands: 19 of the operator's 22 caged
 * orders were unpaired, and under the old reading they were "perfectly
 * releasable" while their SKU resolved to nothing.
 *
 * ## Pairing is item-number grain; the list is order grain
 *
 * Pairing an item number to a catalog entry resolves EVERY order carrying that
 * item number, so `siblingUnpairedCount` tells the UI how many other rows one
 * pairing will clear. The list stays order-grain (what the operator asked for)
 * while the work stays pair-once (what keeps the backlog finite).
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { evaluateReleaseGates } from './release-gates';
import {
  deriveOrderExceptionBlockers,
  type OrderExceptionRow,
  type OrderExceptionScope,
} from './order-exception-types';

// Re-exported so server callers keep one import site; client components must
// import from `./order-exception-types` directly (this module reaches the DB).
export {
  ORDER_EXCEPTION_BLOCKER_LABEL,
  deriveOrderExceptionBlockers,
} from './order-exception-types';
export type {
  OrderExceptionBlocker,
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
  tracking_number: string | null;
  sku_catalog_id: number | string | null;
  catalog_title: string | null;
  catalog_sku: string | null;
  linked_document_count: number | string | null;
  shipping_label_linked: boolean | null;
  shipping_label_purchased: boolean | null;
  sibling_unpaired_count: number | string | null;
}

/**
 * Document + label existence, phrased exactly as `caged-orders.ts` phrases them
 * so an order's G2/G3 answer is identical on both surfaces. Duplicated as SQL
 * text rather than imported because those constants are private to that module
 * and the two queries select different column sets; the RULE they feed
 * (`evaluateReleaseGates`) is the shared thing, and it is imported.
 */
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

function mapRow(row: RawExceptionRow): OrderExceptionRow {
  const skuCatalogId = row.sku_catalog_id == null ? null : Number(row.sku_catalog_id);
  const linkedDocumentCount = Number(row.linked_document_count ?? 0);
  const facts = {
    itemNumber: row.item_number,
    trackingNumber: row.tracking_number,
    skuCatalogId,
    linkedDocumentCount,
    docsNotRequired: row.docs_not_required === true,
    shippingLabelLinked: row.shipping_label_linked === true,
    shippingLabelPurchased: row.shipping_label_purchased === true,
  };
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
    blockers: deriveOrderExceptionBlockers(facts),
    gates: evaluateReleaseGates({
      orderNumber: row.order_id,
      itemNumber: row.item_number,
      trackingNumber: row.tracking_number,
      linkedDocumentCount,
      docsNotRequired: row.docs_not_required === true,
      shippingLabelLinked: row.shipping_label_linked === true,
      shippingLabelPurchased: row.shipping_label_purchased === true,
      skuCatalogId,
    }),
  };
}

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
    o.sku_catalog_id,
    sc.product_title AS catalog_title,
    sc.sku           AS catalog_sku,
    NULLIF(TRIM(COALESCE(stn.tracking_number_raw, '')), '') AS tracking_number,
    ${G2_DOCUMENT_COUNT_SQL} AS linked_document_count,
    ${G3_LABEL_EXISTS_SQL}   AS shipping_label_linked,
    ${G3_LABEL_PURCHASED_SQL} AS shipping_label_purchased,
    ${SIBLING_UNPAIRED_SQL}  AS sibling_unpaired_count
  FROM orders o
  LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
  LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
                          AND sc.organization_id = o.organization_id
`;

/**
 * The exception queue.
 *
 * ## Why `actionable` means CAGED, and nothing else
 *
 * The tempting definition — "every order with a blocker" — was measured
 * against real data before it was written, and it matches **3,526 of 4,217
 * orders** (2,113 even after excluding packed/shipped; 518 inside 30 days).
 * Almost no historical order was ever paired to the catalog. A queue that
 * opens on thousands of rows is not a worklist, it is a wall: nobody finishes
 * it, so nobody starts it, and the surface dies.
 *
 * The cage already IS the curated review set — an order is caged precisely
 * because someone decided it needs looking at before it ships. So `actionable`
 * is exactly the caged set (finishable in a sitting), and `all` is the opt-in
 * backlog sweep for a cleanup run. Widening is one click and never a surprise.
 */
export async function listOrderExceptions(
  orgId: OrgId,
  options: { scope?: OrderExceptionScope; limit?: number; search?: string } = {},
): Promise<OrderExceptionRow[]> {
  const limit = Math.min(Math.max(Number(options.limit) || 200, 1), 500);
  const scope: OrderExceptionScope = options.scope === 'all' ? 'all' : 'actionable';
  const search = (options.search ?? '').trim();

  const params: unknown[] = [orgId];
  let where = `WHERE o.organization_id = $1`;

  if (scope === 'actionable') {
    // The held-for-review set. Caged orders are never "already shipped", so no
    // ship-exclusion is needed (and applying one would silently drop rows).
    where += ` AND o.release_state = 'caged'`;
  } else {
    // Everything still fixable: any blocker, minus what already left the dock.
    where += `
      AND (
        o.release_state = 'caged'
        OR o.sku_catalog_id IS NULL
        OR NULLIF(TRIM(COALESCE(o.item_number, '')), '') IS NULL
        OR o.shipment_id IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM station_activity_logs sal
         WHERE sal.shipment_id = o.shipment_id
           AND sal.organization_id = o.organization_id
           AND sal.activity_type = 'SHIP_CONFIRM'
      )`;
  }

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const p = `$${params.length}`;
    where += `
      AND (
        LOWER(COALESCE(o.order_id, '')) LIKE ${p}
        OR LOWER(COALESCE(o.item_number, '')) LIKE ${p}
        OR LOWER(COALESCE(o.sku, '')) LIKE ${p}
        OR LOWER(COALESCE(o.product_title, '')) LIKE ${p}
      )`;
  }

  params.push(limit);
  const res = await tenantQuery<RawExceptionRow>(
    orgId,
    // COALESCE, not a bare `o.release_state = 'caged'`: that comparison is NULL
    // for every legacy row, and `DESC` in Postgres is NULLS FIRST — which sorted
    // 4,000 un-caged orders ahead of the caged ones and pushed the entire review
    // set past the LIMIT. The queue looked empty while holding 22 rows.
    `${EXCEPTION_SELECT} ${where}
      ORDER BY (COALESCE(o.release_state, '') = 'caged') DESC, o.id DESC
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
