/**
 * The Shipped desk's view filters as SQL — type (`shippedFilter`), carrier
 * (`carrier`), tracking status (`statusCategory`) and exceptions-only
 * (`exceptions`). ONE predicate per filter, read by both the list
 * (`fetchPackerLogRows`' page WHERE) and the sidebar facet counts
 * (`src/lib/nav/facets/shipped.ts`), so a count is by construction the list
 * total for that pick.
 *
 * Every fragment runs over `station_activity_logs sal` + `packer_logs pl`
 * (the page query's own FROM) plus {@link shippedFilterJoins}; aliases end in
 * `_f` so they never collide with the page's optional order laterals.
 *
 * The row semantics are the ones the desk used to apply in the browser
 * (`src/lib/shipped-records.ts`: `isFbaPackerRecord`, `isSkuPackerRecord`,
 * `hasLinkedOrder`, `isExceptionPackerRecord`; `isStalled`), ANDed with the
 * server's older `trackingTypeFilter` narrowing for fba/orders/sku, so the
 * list keeps exactly the rows the two passes together kept.
 */

import type { CarrierCode, ShipmentStatusCategory } from '@/lib/shipping/shipment-status';
import type { ShippedTypeFilter } from './shipped-filter-constants';
import {
  readShippedCarrierFilter,
  readShippedExceptionsFilter,
  readShippedStatusFilter,
} from './shipped-filter-params';

type ParamReader = { get: (k: string) => string | null };

export const SHIPPED_TYPE_FILTERS = ['all', 'orders', 'sku', 'fba'] as const satisfies readonly ShippedTypeFilter[];

export interface ShippedDeskFilters {
  /** `null` = no type predicate at all (callers other than the Shipped desk). */
  type: ShippedTypeFilter | null;
  carrier: CarrierCode | null;
  statusCategory: ShipmentStatusCategory | null;
  exceptionsOnly: boolean;
}

export const NO_SHIPPED_DESK_FILTERS: ShippedDeskFilters = {
  type: null,
  carrier: null,
  statusCategory: null,
  exceptionsOnly: false,
};

/** The desk's own parse of each param (`useShippedTableFilters`); anything else is not a filter. */
export function readShippedDeskFilters(params: ParamReader): ShippedDeskFilters {
  const type = params.get('shippedFilter') ?? '';
  return {
    type: (SHIPPED_TYPE_FILTERS as readonly string[]).includes(type) ? (type as ShippedTypeFilter) : null,
    carrier: readShippedCarrierFilter(params),
    statusCategory: readShippedStatusFilter(params),
    exceptionsOnly: readShippedExceptionsFilter(params),
  };
}

export function hasShippedDeskFilter(filters: ShippedDeskFilters): boolean {
  return filters.type != null || filters.carrier != null || filters.statusCategory != null || filters.exceptionsOnly;
}

/**
 * The joins every fragment below reads: the row's package (`stn_f`) and, on
 * the enriched read path, its projected order match (`enr_f`).
 */
export function shippedFilterJoins(enriched: boolean): string {
  const stn = `
        LEFT JOIN shipping_tracking_numbers stn_f ON stn_f.id = sal.shipment_id`;
  return enriched
    ? `${stn}
        LEFT JOIN packer_log_enrichment enr_f ON enr_f.sal_id = sal.id`
    : stn;
}

/** The row's `tracking_type` column exactly as the list projects it. */
const TRACKING_TYPE_SQL = `COALESCE(pl.tracking_type,
                 CASE sal.activity_type
                   WHEN 'FBA_READY' THEN 'FNSKU'
                   WHEN 'PACK_COMPLETED' THEN 'ORDERS'
                   ELSE 'SCAN'
                 END)`;

const FBA_SCAN_REF_RE = `'^FBA[0-9A-Z]{8,}$'`;

/** `isFbaPackerRecord`. */
const IS_FBA_SQL = `(BTRIM(COALESCE(sal.scan_ref, '')) ~* ${FBA_SCAN_REF_RE}
        OR UPPER(${TRACKING_TYPE_SQL}) IN ('FBA', 'FNSKU'))`;

/** `isSkuPackerRecord`. */
const IS_SKU_SQL = `(UPPER(${TRACKING_TYPE_SQL}) = 'SKU'
        OR POSITION(':' IN BTRIM(COALESCE(sal.scan_ref, ''))) > 0)`;

/** The server's type narrowing before the move (kept so no list loses or gains a row). */
const SERVER_FBA_SQL = `(COALESCE(pl.tracking_type, '') IN ('FBA', 'FNSKU')
        OR sal.activity_type = 'FBA_READY'
        OR COALESCE(sal.scan_ref, '') ~* ${FBA_SCAN_REF_RE})`;
const SERVER_ORDERS_SQL = `(COALESCE(pl.tracking_type, 'ORDERS') = 'ORDERS'
        AND COALESCE(sal.scan_ref, '') !~* ${FBA_SCAN_REF_RE}
        AND sal.activity_type != 'FBA_READY')`;
const SERVER_SKU_SQL = `COALESCE(pl.tracking_type, '') = 'SKU'`;

/** The package has an owning order in the row's org (the list's `package_owner` / shipment match). */
const PACKAGE_HAS_ORDER_SQL = `(EXISTS (
            SELECT 1 FROM orders o_f
            WHERE o_f.shipment_id = sal.shipment_id
              AND o_f.organization_id = sal.organization_id
        ) OR EXISTS (
            SELECT 1 FROM shipment_links sl_f
            JOIN orders o_f ON o_f.id = sl_f.owner_id AND o_f.organization_id = sal.organization_id
            WHERE sl_f.owner_type = 'ORDER'
              AND sl_f.shipment_id = sal.shipment_id
              AND sl_f.organization_id = sal.organization_id
        ))`;

/**
 * `hasLinkedOrder || isExceptionPackerRecord` — the row resolves an order
 * (`o.id`), or carries an orders_exceptions row (`oe.id`; an exception reason
 * implies one). Enriched path: the projection's `order_row_id` when the row is
 * projected, else the package's owning order (the list's fallback laterals).
 */
function linkedOrExceptionSql(enriched: boolean): string {
  const order = enriched
    ? `(EXISTS (
            SELECT 1 FROM orders o_f
            WHERE o_f.id = enr_f.order_row_id
              AND o_f.organization_id = sal.organization_id
        ) OR (enr_f.sal_id IS NULL AND ${PACKAGE_HAS_ORDER_SQL}))`
    : PACKAGE_HAS_ORDER_SQL;
  return `(${order}
        OR EXISTS (SELECT 1 FROM orders_exceptions oe_f WHERE oe_f.id = sal.orders_exception_id))`;
}

/** Row membership in one type view (`shippedFilter`), never NULL. */
export function shippedTypeSql(type: ShippedTypeFilter, enriched: boolean): string {
  const linked = linkedOrExceptionSql(enriched);
  switch (type) {
    case 'fba':
      return `COALESCE((${SERVER_FBA_SQL} AND ${IS_FBA_SQL}), false)`;
    case 'orders':
      return `COALESCE((${SERVER_ORDERS_SQL} AND NOT ${IS_FBA_SQL} AND ${linked}), false)`;
    case 'sku':
      return `COALESCE((${SERVER_SKU_SQL} AND ${IS_SKU_SQL}), false)`;
    case 'all':
      return `COALESCE((NOT ${IS_SKU_SQL} AND (${IS_FBA_SQL} OR ${linked})), false)`;
  }
}

/** The package's carrier as the desk compares it (upper-cased, '' when unknown). */
export const SHIPPED_CARRIER_SQL = `UPPER(COALESCE(stn_f.carrier, ''))`;

/** The package's latest tracking status category (upper-cased, '' when unknown). */
export const SHIPPED_STATUS_SQL = `UPPER(COALESCE(stn_f.latest_status_category, ''))`;

/** Exceptions-only: the carrier flagged an exception, or the package stalled (`isStalled`, 72 h). */
export const SHIPPED_EXCEPTION_SQL = `COALESCE((
        COALESCE(stn_f.has_exception, false)
        OR (
          NOT COALESCE(stn_f.is_terminal, false)
          AND UPPER(COALESCE(stn_f.latest_status_category, '')) <> 'DELIVERED'
          AND stn_f.latest_event_at IS NOT NULL
          AND stn_f.latest_event_at < NOW() - INTERVAL '72 hours'
        )
      ), false)`;

/**
 * WHERE conditions for the active filters. `bind` pushes a value and returns
 * its placeholder; carrier and status are the only bound values.
 */
export function shippedDeskConditions(
  filters: ShippedDeskFilters,
  enriched: boolean,
  bind: (value: unknown) => string,
): string[] {
  const conditions: string[] = [];
  if (filters.type) conditions.push(shippedTypeSql(filters.type, enriched));
  if (filters.carrier) conditions.push(`${SHIPPED_CARRIER_SQL} = ${bind(filters.carrier)}`);
  if (filters.statusCategory) conditions.push(`${SHIPPED_STATUS_SQL} = ${bind(filters.statusCategory)}`);
  if (filters.exceptionsOnly) conditions.push(SHIPPED_EXCEPTION_SQL);
  return conditions;
}
