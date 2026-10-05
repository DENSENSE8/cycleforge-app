/**
 * The Shipped desk's view filters as SQL — type (`shippedFilter`), carrier
 * (`carrier`), tracking status (`statusCategory`), exceptions-only
 * (`exceptions`) and package status (`cardStatus`). ONE predicate per filter, read by both the list
 * (`fetchPackerLogRows`' page WHERE) and the sidebar facet counts
 * (`src/lib/nav/facets/shipped.ts`), so a count is by construction the list
 * total for that pick.
 *
 * Every fragment runs over `station_activity_logs sal` + `packer_logs pl`
 * (the page query's own FROM) plus {@link shippedFilterJoins}; aliases end in
 * `_f` so they never collide with the page's optional order laterals.
 *
 * Type membership is based on the station record's tracking class, not on
 * whether an order currently owns the shipment. This keeps scanned-out
 * unfound/unmatched ORDERS labels visible for reconciliation.
 */

import type { CarrierCode, ShipmentStatusCategory } from '@/lib/shipping/shipment-status';
import type { ShippedTypeFilter } from './shipped-filter-constants';
import { SHIPPED_STATUS_CHIPS, type ShippedStatusChip } from '@/components/shipped/ledger/shipped-card-model';
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
  /** `account_source` values, lower-cased. Empty = no channel predicate. */
  channels: readonly string[];
  /** Package-status pills (`?cardStatus=`, `shippedStatusKeys`), OR across picks. Empty = no predicate. */
  cardStatus: readonly ShippedStatusChip[];
}

export const NO_SHIPPED_DESK_FILTERS: ShippedDeskFilters = {
  type: null,
  carrier: null,
  statusCategory: null,
  exceptionsOnly: false,
  channels: [],
  cardStatus: [],
};

/** The desk's own parse of each param (`useShippedTableFilters`); anything else is not a filter. */
export function readShippedDeskFilters(params: ParamReader): ShippedDeskFilters {
  const type = params.get('shippedFilter') ?? '';
  const parsed = (SHIPPED_TYPE_FILTERS as readonly string[]).includes(type) ? (type as ShippedTypeFilter) : null;
  const channels = (params.get('channel') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  return {
    // `all` is absence: every package that left, including SKU. A predicate that
    // drops SKU makes `?shippedFilter=all` disagree with a URL that names no type.
    type: parsed === 'all' ? null : parsed,
    carrier: readShippedCarrierFilter(params),
    statusCategory: readShippedStatusFilter(params),
    exceptionsOnly: readShippedExceptionsFilter(params),
    channels,
    cardStatus: (params.get('cardStatus') ?? '')
      .split(',')
      .filter((key): key is ShippedStatusChip => (SHIPPED_STATUS_CHIPS as readonly string[]).includes(key)),
  };
}

export function hasShippedDeskFilter(filters: ShippedDeskFilters): boolean {
  return (
    filters.type != null
    || filters.carrier != null
    || filters.statusCategory != null
    || filters.exceptionsOnly
    || filters.channels.length > 0
    || filters.cardStatus.length > 0
  );
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

/** Operational tracking-class gates; order ownership is deliberately not one. */
const SERVER_FBA_SQL = `(COALESCE(pl.tracking_type, '') IN ('FBA', 'FNSKU')
        OR sal.activity_type = 'FBA_READY'
        OR COALESCE(sal.scan_ref, '') ~* ${FBA_SCAN_REF_RE})`;
const SERVER_ORDERS_SQL = `(COALESCE(pl.tracking_type, 'ORDERS') = 'ORDERS'
        AND COALESCE(sal.scan_ref, '') !~* ${FBA_SCAN_REF_RE}
        AND sal.activity_type != 'FBA_READY')`;
const SERVER_SKU_SQL = `COALESCE(pl.tracking_type, '') = 'SKU'`;

/** Row membership in one type view (`shippedFilter`), never NULL. */
export function shippedTypeSql(type: ShippedTypeFilter, _enriched: boolean): string {
  switch (type) {
    case 'fba':
      return `COALESCE((${SERVER_FBA_SQL} AND ${IS_FBA_SQL}), false)`;
    case 'orders':
      return `COALESCE((${SERVER_ORDERS_SQL} AND NOT ${IS_FBA_SQL}), false)`;
    case 'sku':
      return `COALESCE((${SERVER_SKU_SQL} AND ${IS_SKU_SQL}), false)`;
    case 'all':
      return 'true';
  }
}

/** The package's carrier as the desk compares it (upper-cased, '' when unknown). */
export const SHIPPED_CARRIER_SQL = `UPPER(COALESCE(stn_f.carrier, ''))`;

/** The package's latest tracking status category (upper-cased, '' when unknown). */
export const SHIPPED_STATUS_SQL = `UPPER(COALESCE(stn_f.latest_status_category, ''))`;

/** The package's channel, the same expression the list projects as `account_source`. */
export const SHIPPED_CHANNEL_SQL = `LOWER(COALESCE(o.account_source, CASE WHEN NULLIF(BTRIM(sal.fnsku), '') IS NOT NULL THEN 'fba' ELSE '' END))`;

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
 * The joins {@link shippedCardKeysSql} reads beyond {@link shippedFilterJoins}:
 * the row's unmatched-scan hold (`oe_f`) and its order's test deadline (`wa_f`,
 * the list's `ship_by_date`). Goes after the order joins — it reads `o`.
 */
export const SHIPPED_CARD_JOINS = `
        LEFT JOIN orders_exceptions oe_f ON oe_f.id = sal.orders_exception_id
        LEFT JOIN LATERAL (
            SELECT wa.deadline_at
              FROM work_assignments wa
             WHERE wa.entity_type = 'ORDER' AND wa.entity_id = o.id AND wa.work_type = 'TEST'
             ORDER BY CASE wa.status WHEN 'IN_PROGRESS' THEN 1 WHEN 'ASSIGNED' THEN 2 WHEN 'OPEN' THEN 3 WHEN 'DONE' THEN 4 ELSE 5 END,
                      wa.updated_at DESC, wa.id DESC
             LIMIT 1
        ) wa_f ON TRUE`;

/**
 * The pills one row lights (`shippedStatusKeys`) as `text[]` — ONE expression
 * for the list's `?cardStatus=` predicate and the sidebar's Package status
 * counts. Reads `stn_f`, `o` and {@link SHIPPED_CARD_JOINS}; `shipConfirmAt` is
 * the package's latest dock handoff (`sqlLatestShipConfirmAt`).
 */
export function shippedCardKeysSql(shipConfirmAt: string): string {
  const category = SHIPPED_STATUS_SQL;
  return `ARRAY_REMOVE(ARRAY[
            'FULFILLED',
            CASE WHEN ${category} = 'LABEL_CREATED' THEN 'LABEL_ONLY' END,
            CASE WHEN ${category} IN ('ACCEPTED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY') THEN 'ON_THE_WAY' END,
            CASE WHEN ${category} = 'DELIVERED' OR stn_f.is_delivered IS TRUE THEN 'DELIVERED' END,
            CASE WHEN wa_f.deadline_at IS NOT NULL AND ${shipConfirmAt} > wa_f.deadline_at THEN 'LATE' END,
            CASE WHEN ${category} IN ('EXCEPTION', 'RETURNED') OR stn_f.has_exception IS TRUE THEN 'EXCEPTION' END,
            CASE WHEN oe_f.id IS NOT NULL AND o.id IS NULL AND LOWER(BTRIM(COALESCE(oe_f.status, ''))) = 'open' THEN 'UNMATCHED' END,
            CASE WHEN sal.station IS DISTINCT FROM 'PACK' OR sal.staff_id IS NULL THEN 'NEVER_PACKED' END
          ]::text[], NULL)`;
}

/**
 * WHERE conditions for the active filters. `bind` pushes a value and returns
 * its placeholder; carrier, status, channel and package status are the bound
 * values. A package-status pick reads `o` and {@link SHIPPED_CARD_JOINS};
 * `shipConfirmAt` as in {@link shippedCardKeysSql}.
 */
export function shippedDeskConditions(
  filters: ShippedDeskFilters,
  enriched: boolean,
  bind: (value: unknown) => string,
  shipConfirmAt: string,
): string[] {
  const conditions: string[] = [];
  if (filters.type) conditions.push(shippedTypeSql(filters.type, enriched));
  if (filters.carrier) conditions.push(`${SHIPPED_CARRIER_SQL} = ${bind(filters.carrier)}`);
  if (filters.statusCategory) conditions.push(`${SHIPPED_STATUS_SQL} = ${bind(filters.statusCategory)}`);
  if (filters.exceptionsOnly) conditions.push(SHIPPED_EXCEPTION_SQL);
  if (filters.channels.length > 0) conditions.push(`${SHIPPED_CHANNEL_SQL} = ANY(${bind(filters.channels)}::text[])`);
  if (filters.cardStatus.length > 0) {
    conditions.push(`${shippedCardKeysSql(shipConfirmAt)} && ${bind(filters.cardStatus)}::text[]`);
  }
  return conditions;
}
