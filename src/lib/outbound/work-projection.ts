import { z } from 'zod';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { sqlOrderHasPackScan, sqlOrderHasShipConfirm } from '@/lib/orders/order-grain-sql';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { listingCoverThumbUrlSql } from '@/lib/photos/listing-photos';
import { liveLabelLateralSql, mapLiveLabelRow } from './live-label';
import {
  OUTBOUND_MATERIAL_JOINS_SQL,
  OUTBOUND_MATERIAL_JSON_SQL,
  fingerprintFromRow,
  materialAllowsApplyLabel,
} from './work-material';
import {
  outboundFulfillmentRouteSchema,
  OUTBOUND_NEXT_ACTION_LABELS,
  OUTBOUND_SAVED_VIEWS,
  OUTBOUND_SAVED_VIEW_IDS,
  outboundWorkQuerySchema,
  type OutboundFulfillmentRoute,
  type OutboundLabelState,
  type OutboundNextAction,
  type OutboundNextActionKind,
  type OutboundSavedViewId,
  type OutboundWarehouseStage,
  type OutboundWorkItem,
  type OutboundWorkPage,
} from './work-contract';

export { OUTBOUND_SAVED_VIEWS, outboundWorkQuerySchema } from './work-contract';
export type {
  OutboundLabelState, OutboundNextAction, OutboundSavedView, OutboundSavedViewId,
  OutboundWarehouseStage, OutboundWorkItem, OutboundWorkPage,
} from './work-contract';

type WorkCursor = { outOfStock: boolean; urgent: boolean; createdAt: string; id: number };

interface WorkRow {
  id: number | string;
  order_reference: string | null;
  account_source: string | null;
  product_title: string | null;
  item_number: string | null;
  paired: boolean;
  zoho_item_title: string | null;
  catalog_product_title: string | null;
  thumbnail_url: string | null;
  sku: string | null;
  condition: string | null;
  quantity: string | null;
  sale_amount: string | null;
  is_urgent: boolean;
  is_out_of_stock: boolean;
  ship_by: Date | string | null;
  warehouse_stage: OutboundWarehouseStage;
  view_ids: readonly string[] | null;
  shipment_id: number | string | null;
  tracking_number: string | null;
  carrier: string | null;
  tracking_category: string | null;
  label_ingestion_id: number | string | null;
  label_state: OutboundLabelState | null;
  material: unknown;
  document_count: number | string;
  updated_at: Date | string | null;
  created_at: Date | string;
  acknowledged_at: Date | string | null;
  acknowledged_by: number | string | null;
  acknowledged_by_name: string | null;
  fulfillment_route: string | null;
  stock_ready: number | string | null;
  stock_received: number | string | null;
  live_label_live: boolean;
  live_label_document_id: number | string | null;
  live_label_source: string | null;
  live_label_tracking: string | null;
  live_label_carrier: string | null;
  live_label_shipstation_label_id: string | null;
  live_label_shipment_id: number | string | null;
}

export interface OutboundWorkDependencies {
  query: (organizationId: OrgId, text: string, values: readonly unknown[]) => Promise<{ rows: WorkRow[] }>;
}

const dependencies: OutboundWorkDependencies = { query: tenantQuery as OutboundWorkDependencies['query'] };

function asInteger(value: number | string | null, field: string): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Outbound work projection returned an invalid ${field}.`);
  return parsed;
}

function asDate(value: Date | string | null, field: string): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`Outbound work projection returned an invalid ${field}.`);
  return date.toISOString();
}

function decodeCursor(raw: string | undefined): WorkCursor | null {
  if (!raw) return null;
  try {
    const parsed = z.object({
      outOfStock: z.boolean(),
      urgent: z.boolean(),
      createdAt: z.string().datetime({ offset: true }),
      id: z.number().int().positive(),
    }).strict().parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    return parsed;
  } catch {
    throw new Error('Invalid outbound work cursor.');
  }
}

function encodeCursor(cursor: WorkCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/**
 * Triage membership (Outbound Triage board): the To-ship desk's own live-work
 * predicates — not dock-scanned, not carrier-shipped, not packed, not FBA —
 * narrowed to orders nobody has acknowledged yet. The same fragments
 * `/api/orders` uses, so the board and the desk cannot disagree about what is
 * shipped or packed. Unlike the desk, triage does NOT apply the pairing gate
 * (`liveWorkingSetSql`): identifying an order — pairing it to the catalog —
 * is a triage step, so a caged, unpaired order belongs here (`product.paired`
 * says which). The warehouse stage alone cannot decide membership: legacy
 * orders carry no units, so they would all read READY forever.
 *
 * Argument order is load-bearing: nested AND args short-circuit left to
 * right, so the column checks and the (already joined) carrier status reject
 * historical rows before either station-activity EXISTS probe runs.
 */
const TRIAGE_MEMBERSHIP_SQL = `o.acknowledged_at IS NULL
            AND stage.value <> 'SCANNED_OUT'
            AND COALESCE(o.fulfillment_channel, '') <> 'AFN'
            AND NOT ${SHIPPED_BY_CARRIER_SQL}
            AND NOT ${sqlOrderHasShipConfirm('o')}
            AND NOT ${sqlOrderHasPackScan('o')}`;

/**
 * Two layers. The inner `page` decides membership, order and the page cut;
 * the outer layer adds display-only facts (SKU identity, stock, the live
 * label, the acknowledger) to at most `limit + 1` rows, so none of those
 * lookups runs across the tenant's whole order history.
 *
 * SKU identity (operator 2026-09-15, "one SKU, one title, one photo"): the
 * catalog and the Zoho item are reached by the EXACT, org-scoped SKU string —
 * never similarity-gated. The Zoho item governs both title and photo; the
 * catalog is the fallback only when no active Zoho item exists, and the
 * catalog photo never stands in for a Zoho item that has none (the
 * `RECEIVING_LINE_IMAGE_URL_SQL` rule). Below the catalog photo sits the SKU's
 * listing-gallery cover — where acquired marketplace media lands.
 */
const WORK_SQL = `
  SELECT
    page.*,
    o.item_number,
    (o.sku_catalog_id IS NOT NULL) AS paired,
    o.acknowledged_at,
    o.acknowledged_by,
    ack_staff.name AS acknowledged_by_name,
    o.fulfillment_route,
    zi.name AS zoho_item_title,
    sc.product_title AS catalog_product_title,
    CASE
      WHEN zi.zoho_item_id IS NOT NULL THEN
        CASE WHEN NULLIF(zi.image_document_id, '') IS NOT NULL
               THEN '/api/zoho/items/' || zi.zoho_item_id || '/image'
             ELSE NULLIF(zi.image_url, '')
        END
      ELSE COALESCE(NULLIF(sc.image_url, ''), ${listingCoverThumbUrlSql('sc')})
    END AS thumbnail_url,
    stock.ready AS stock_ready,
    stock.received AS stock_received,
    live_label.*
  FROM (
  SELECT
    o.id,
    o.order_id AS order_reference,
    o.account_source,
    o.product_title,
    o.sku,
    o.condition,
    o.quantity,
    o.sale_amount::text,
    o.is_urgent,
    o.is_out_of_stock,
    deadline.ship_by,
    stage.value AS warehouse_stage,
    membership.view_ids,
    stn.id AS shipment_id,
    stn.tracking_number_normalized AS tracking_number,
    stn.carrier,
    stn.latest_status_category AS tracking_category,
    latest_label.id AS label_ingestion_id,
    latest_label.state AS label_state,
    ${OUTBOUND_MATERIAL_JSON_SQL} AS material,
    (SELECT COUNT(*)::int FROM documents d WHERE d.organization_id = o.organization_id AND d.entity_type = 'ORDER' AND d.entity_id = o.id) AS document_count,
    -- The orders table has no updated_at column; referencing one made this
    -- query fail with 42703 on every live call. The revision is the latest of
    -- the order's own timestamps and of its allocated units, because a unit
    -- moving PICKED -> PACKED is exactly the change the queue must reveal.
    -- GREATEST ignores NULLs in Postgres. This is a DISPLAY revision, not an
    -- optimistic-concurrency token: see the rowVersion note in work-contract.
    GREATEST(o.created_at, o.tracking_added_at, o.label_printed_at, o.released_at,
             unit_progress.last_unit_update) AS updated_at,
    o.created_at
  FROM orders o
  LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id AND stn.organization_id = o.organization_id
  LEFT JOIN LATERAL (
    SELECT MIN(wa.deadline_at) AS ship_by
      FROM work_assignments wa
     WHERE wa.organization_id = o.organization_id
       AND wa.entity_type = 'ORDER'
       AND wa.entity_id = o.id
       AND wa.status IN ('ASSIGNED', 'IN_PROGRESS')
  ) deadline ON TRUE
  ${OUTBOUND_MATERIAL_JOINS_SQL}
  LEFT JOIN LATERAL (
    SELECT ARRAY_REMOVE(ARRAY[
      'all'::text,
      CASE WHEN ${TRIAGE_MEMBERSHIP_SQL} THEN 'triage' END,
      CASE WHEN stage.value = 'READY' THEN 'ready' END,
      CASE WHEN stage.value IN ('PICKED', 'PACKED', 'LABELED')
            AND COALESCE(latest_label.state NOT IN ('MATCHED', 'APPLIED'), TRUE) THEN 'pending' END,
      CASE WHEN stage.value <> 'SCANNED_OUT'
            AND (COALESCE(o.is_urgent, FALSE)
                 OR (deadline.ship_by IS NOT NULL AND deadline.ship_by <= now() + interval '2 hours')) THEN 'at-risk' END,
      CASE WHEN stage.value IN ('PACKED', 'LABELED')
            AND COALESCE(latest_label.state IN ('MATCHED', 'APPLIED'), FALSE) THEN 'ship-now' END,
      CASE WHEN COALESCE(o.is_out_of_stock, FALSE)
            OR COALESCE(latest_label.state IN ('QUARANTINED', 'FAILED'), FALSE) THEN 'exceptions' END,
      CASE WHEN stage.value = 'SCANNED_OUT' THEN 'completed' END
    ], NULL) AS view_ids
  ) membership ON TRUE
  WHERE o.organization_id = $1
    AND (
      $2::boolean IS NULL
      OR (o.is_out_of_stock, o.is_urgent, o.created_at, o.id) < ($2::boolean, $3::boolean, $4::timestamptz, $5::int)
    )
    AND (
      $6::text IS NULL
      OR o.id::text = $6
      OR o.order_id ILIKE '%' || $6 || '%'
      OR o.sku ILIKE '%' || $6 || '%'
      OR o.product_title ILIKE '%' || $6 || '%'
      OR stn.tracking_number_normalized ILIKE '%' || $6 || '%'
    )
    AND ($9::int IS NULL OR o.id = $9)
    AND $8::text = ANY (membership.view_ids)
  ORDER BY o.is_out_of_stock DESC, o.is_urgent DESC, o.created_at DESC, o.id DESC
  LIMIT $7
  ) page
  JOIN orders o ON o.id = page.id AND o.organization_id = $1
  LEFT JOIN staff ack_staff ON ack_staff.id = o.acknowledged_by
  LEFT JOIN sku_catalog sc ON sc.sku = o.sku AND sc.organization_id = o.organization_id
  LEFT JOIN LATERAL (
    SELECT i.name, i.zoho_item_id, i.image_document_id, i.image_url
      FROM items i
     WHERE i.sku = o.sku
       AND i.organization_id = o.organization_id
       AND i.status = 'active'
     ORDER BY i.updated_at DESC, i.id
     LIMIT 1
  ) zi ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE su.current_status IN ('STOCKED', 'TESTED'))::int AS ready,
           COUNT(*) FILTER (WHERE su.current_status = 'RECEIVED')::int AS received
      FROM serial_units su
     WHERE su.organization_id = o.organization_id
       AND su.sku = o.sku
  ) stock ON TRUE
  ${liveLabelLateralSql('o')}
  ORDER BY page.is_out_of_stock DESC, page.is_urgent DESC, page.created_at DESC, page.id DESC
`;

const KNOWN_VIEW_IDS: ReadonlySet<string> = new Set(OUTBOUND_SAVED_VIEW_IDS);

/**
 * Membership arrives from SQL, so it is validated like any other projected
 * value: an unknown or missing id means the server rule and this contract have
 * drifted, and that must fail loudly rather than reach a client.
 */
function mapViews(raw: WorkRow['view_ids']): OutboundSavedViewId[] {
  const views = Array.isArray(raw) ? raw.map((value) => String(value)) : [];
  if (!views.includes('all') || views.some((id) => !KNOWN_VIEW_IDS.has(id))) {
    throw new Error('Outbound work projection returned an unknown saved-view membership.');
  }
  return views as OutboundSavedViewId[];
}

/** §3: the server names the next permitted action; the client only renders it. */
function nextActionFor(stage: OutboundWarehouseStage, views: readonly OutboundSavedViewId[], canApplyLabel: boolean): OutboundNextAction {
  const kind: OutboundNextActionKind = views.includes('exceptions') ? 'RESOLVE_EXCEPTION'
    : canApplyLabel ? 'APPLY_LABEL'
      : stage === 'SCANNED_OUT' ? 'VIEW_RECEIPT'
        : stage === 'READY' ? 'START_PICK'
          : 'CONTINUE_FULFILLMENT';
  return { kind, label: OUTBOUND_NEXT_ACTION_LABELS[kind], command: kind === 'APPLY_LABEL' ? 'APPLY_LABEL' : null };
}

/** `orders_fulfillment_route_chk` guards the column; a value outside it is drift and fails closed. */
function mapRoute(raw: string | null): OutboundFulfillmentRoute | null {
  if (raw == null) return null;
  const parsed = outboundFulfillmentRouteSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Outbound work projection returned an unknown fulfillment route.');
  return parsed.data;
}

function mapRow(row: WorkRow): OutboundWorkItem {
  const id = asInteger(row.id, 'order id');
  if (id == null || id < 1) throw new Error('Outbound work projection returned an invalid order id.');
  const createdAt = asDate(row.created_at, 'created timestamp');
  const updatedAt = asDate(row.updated_at, 'updated timestamp') ?? createdAt;
  if (!createdAt || !updatedAt) throw new Error('Outbound work projection requires order timestamps.');
  // SKU identity title ladder, most authoritative first: the Zoho item name,
  // then the catalog title, then the order's own marketplace title, then the SKU.
  const title = row.zoho_item_title?.trim() || row.catalog_product_title?.trim()
    || row.product_title?.trim() || row.sku?.trim() || `Order #${id}`;
  // Mapped by the same function as `readLiveOrderLabel`; `shipmentId` is already published under `tracking`.
  const { shipmentId: _labelShipmentId, ...shippingLabel } = mapLiveLabelRow(row);
  const labelState = row.label_state ?? 'NONE';
  const views = mapViews(row.view_ids);
  // One authority for both the published token and the permitted command: the
  // executor re-derives them from the same SQL expression under lock.
  const { material, fingerprint } = fingerprintFromRow(row.material);
  const allowedActions: OutboundWorkItem['allowedActions'] = materialAllowsApplyLabel(material) ? ['APPLY_LABEL'] : [];
  return {
    id,
    reference: row.order_reference?.trim() || `#${id}`,
    source: row.account_source?.trim() || null,
    product: {
      title,
      sku: row.sku?.trim() || null,
      itemNumber: row.item_number?.trim() || null,
      paired: row.paired === true,
      condition: row.condition?.trim() || null,
      quantity: row.quantity?.trim() || '1',
      price: row.sale_amount?.trim() || null,
      thumbnail: { alt: title, url: row.thumbnail_url?.trim() || null, version: null },
    },
    priority: { urgent: row.is_urgent === true, outOfStock: row.is_out_of_stock === true, shipBy: asDate(row.ship_by, 'ship-by timestamp') },
    warehouseStage: row.warehouse_stage,
    tracking: {
      shipmentId: row.shipment_id == null ? null : String(row.shipment_id),
      number: row.tracking_number?.trim() || null,
      carrier: row.carrier?.trim() || null,
      category: row.tracking_category?.trim() || null,
    },
    label: { ingestionId: asInteger(row.label_ingestion_id, 'label ingestion id'), state: labelState },
    documents: { count: asInteger(row.document_count, 'document count') ?? 0 },
    acknowledgment: {
      at: asDate(row.acknowledged_at, 'acknowledged timestamp'),
      by: asInteger(row.acknowledged_by, 'acknowledging staff id'),
      byName: row.acknowledged_by_name?.trim() || null,
      route: mapRoute(row.fulfillment_route),
    },
    stock: {
      ready: asInteger(row.stock_ready, 'ready stock count') ?? 0,
      received: asInteger(row.stock_received, 'received stock count') ?? 0,
    },
    shippingLabel,
    rowVersion: updatedAt,
    fingerprint,
    allowedActions,
    views,
    nextAction: nextActionFor(row.warehouse_stage, views, allowedActions.length > 0),
  };
}

export async function listOutboundWork(
  organizationId: OrgId,
  input: z.input<typeof outboundWorkQuerySchema> = {},
  overrides: Partial<OutboundWorkDependencies> = {},
): Promise<OutboundWorkPage> {
  const parsed = outboundWorkQuerySchema.parse(input);
  const cursor = decodeCursor(parsed.cursor);
  const deps = { ...dependencies, ...overrides };
  const result = await deps.query(organizationId, WORK_SQL, [
    organizationId,
    cursor?.outOfStock ?? null,
    cursor?.urgent ?? null,
    cursor?.createdAt ?? null,
    cursor?.id ?? null,
    parsed.query ?? null,
    parsed.limit + 1,
    parsed.view,
    parsed.id ?? null,
  ]);
  const rows = result.rows.slice(0, parsed.limit);
  const items = rows.map(mapRow);
  const tail = rows[rows.length - 1];
  const hasNext = result.rows.length > parsed.limit && tail;
  const tailCreatedAt = tail ? asDate(tail.created_at, 'created timestamp') : null;
  return {
    view: parsed.view,
    views: [...OUTBOUND_SAVED_VIEWS],
    items,
    nextCursor: hasNext && tailCreatedAt
      ? encodeCursor({ outOfStock: tail.is_out_of_stock, urgent: tail.is_urgent, createdAt: tailCreatedAt, id: Number(tail.id) })
      : null,
  };
}
