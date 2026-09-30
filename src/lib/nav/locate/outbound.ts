/**
 * Outbound locator — where an order lives on the Shipping desk. One bucket
 * per desk view (`DESK_VIEWS`, in `DESK_VIEW_ORDER`), each counted with the
 * SAME predicate that view's list reads:
 *
 * - Allocate (and any view whose rows are `/api/orders` rows):
 *   `sqlDeskQueueScope` (`/api/orders` with the flags the desk sends —
 *   `inWarehouse=true` plus the view's defining params);
 * - Exceptions: `sqlOrderInExceptionQueue` = `exceptionScopeWhere('actionable')`
 *   (`/api/orders/exceptions`);
 * - Shipped: `buildPackerLogBaseWhere` (`/api/packerlogs`), one row per
 *   package, with no date window — where an order lives, not what this week
 *   shows. Its href opens the list on the same window (`allDates=1`), so the
 *   rows after the click are the count.
 *
 * `q` (the field's text) counts what each view's own find matches: the queue
 * views run their list SQL (`buildOrdersListSql`, search included) wrapped in
 * a count; Exceptions adds `exceptionSearchSql`; Shipped `sqlPackerLogSearch`.
 *
 * `refs` (a pasted list) matches each ref exactly — order number / item
 * number (`sqlIdentifierEqualsQuery`) or tracking (`sqlTrackingNumberMatches`,
 * gated by `looksLikeTrackingIdentifier`), the header find's identifier arm —
 * and reads every bucket's membership per matched order in one statement.
 */

import type { NavLocateBucket, NavLocateEntry } from '@/lib/nav/context/schema';
import { buildPackerLogBaseWhere, sqlPackerLogSearch } from '@/lib/neon/packer-logs-week';
import { sqlDeskQueueScope } from '@/lib/orders/desk-view-sql';
import { sqlOrderInExceptionQueue } from '@/lib/orders/exception-membership';
import { exceptionScopeWhere, exceptionSearchSql } from '@/lib/orders/order-exceptions';
import { parseOrdersListQuery, type OrdersListQuery } from '@/lib/orders/orders-list-query';
import {
  DESK_VIEW_ORDER,
  deskViewHref,
  getDeskView,
  isDeskQueueView,
  type DeskQueueViewId,
  type DeskViewId,
} from '@/lib/outbound/desk-views';
import { looksLikeTrackingIdentifier } from '@/lib/search/global-entity-search';
import { sqlIdentifierEqualsQuery } from '@/lib/search/order-number-match';
import { sqlOrderOwnsShipment, sqlTrackingNumberMatches } from '@/lib/search/order-tracking-match-sql';
import { searchHitHref } from '@/lib/search/search-hit';
import { escapeLike } from '@/lib/sql-like';
import type { OrgId } from '@/lib/tenancy/constants';
import { orderTrackingMatchKeys } from '@/lib/tracking-format';
import { SHIPPED_ALL_DATES_PARAM } from '@/lib/shipping/shipped-filter/shipped-filter-params';

/** The Shipped list's gate (`/api/packerlogs`) — without it the bucket is omitted, not the answer. */
export const SHIPPED_BUCKET_PERMISSION = 'packing.view';

const TONE: Readonly<Record<DeskViewId, NavLocateBucket['tone']>> = {
  exceptions: 'danger',
  triage: 'neutral',
  shipped: 'success',
};

/** The list each bucket counts. Shipped opens all-time — the window its count reads. */
const BUCKET_HREF: Readonly<Record<DeskViewId, string>> = {
  exceptions: deskViewHref('exceptions'),
  triage: deskViewHref('triage'),
  shipped: withParam(deskViewHref('shipped'), SHIPPED_ALL_DATES_PARAM, '1'),
};

/** Add one param to an href that may already carry a query (the Shipped view defines `shippedFilter`). */
function withParam(href: string, key: string, value: string): string {
  const url = new URL(href, 'http://nav.local');
  url.searchParams.set(key, value);
  return `${url.pathname}?${url.searchParams}`;
}

/** Views whose rows are `/api/orders` rows, in bucket order. */
const QUEUE_VIEWS: readonly DeskQueueViewId[] = DESK_VIEW_ORDER.filter(isDeskQueueView);

export type OutboundSqlRunner = (sql: string, params: readonly unknown[]) => Promise<Array<Record<string, unknown>>>;

export interface OutboundLocateDeps {
  run: OutboundSqlRunner;
  /** `GET /api/orders` SQL for one parsed query — the desk's own feed. */
  ordersListSql(query: OrdersListQuery): Promise<{ sql: string; params: unknown[] }>;
}

/** The buckets this caller may see, in `DESK_VIEW_ORDER`. */
export function outboundBucketIds(permissions: ReadonlySet<string>): DeskViewId[] {
  return DESK_VIEW_ORDER.filter((id) => id !== 'shipped' || permissions.has(SHIPPED_BUCKET_PERMISSION));
}

function bucketsWith(ids: readonly DeskViewId[], counts: Partial<Record<DeskViewId, number>>): NavLocateBucket[] {
  return ids.map((id) => ({
    id,
    label: getDeskView(id).label,
    tone: TONE[id],
    href: BUCKET_HREF[id],
    count: counts[id] ?? 0,
  }));
}

/**
 * The To-ship desk's search request for a queue view — `fetchUnshippedOrdersData`
 * with `strictSearchScope` (every desk mount): the scope flag plus the view's
 * defining params, and the text.
 */
export function queueSearchQuery(view: DeskQueueViewId, q: string): OrdersListQuery {
  return parseOrdersListQuery(new URLSearchParams({ q, inWarehouse: 'true', ...getDeskView(view).params }));
}

/** Exceptions + (optionally) Shipped counts for the field's text — one statement. */
export function buildOutboundTextCountSql(orgId: OrgId, q: string, withShipped: boolean) {
  const params: unknown[] = [orgId, `%${q.toLowerCase()}%`];
  let shipped = '';
  if (withShipped) {
    const { conditions } = buildPackerLogBaseWhere({ organizationId: orgId }, params);
    params.push(`%${escapeLike(q)}%`);
    conditions.push(sqlPackerLogSearch(`$${params.length}`));
    shipped = `,
      (SELECT COUNT(DISTINCT sal.shipment_id)::int
         FROM station_activity_logs sal
         LEFT JOIN packer_logs pl ON pl.id = sal.packer_log_id
        WHERE ${conditions.join('\n          AND ')}) AS shipped`;
  }
  const sql = `
    SELECT
      (SELECT COUNT(*)::int
         FROM orders o
         LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
        ${exceptionScopeWhere('actionable')}
          AND ${exceptionSearchSql('$2')}) AS exceptions${shipped}`;
  return { sql, params };
}

/** Order-side candidate keys — computed once per order / tracking row, then hash-joined. */
const ORDER_KEY_SQL = (column: string) => `right(regexp_replace(lower(COALESCE(${column}, '')), '[^a-z0-9]', '', 'g'), 4)`;
const ORDER_DIGITS8_SQL = (column: string) => `right(regexp_replace(COALESCE(${column}, ''), '[^0-9]', '', 'g'), 8)`;

/**
 * One statement: every order each ref names, with its membership in every bucket.
 *
 * The match is the header find's identifier arm, exactly. It cannot index —
 * every arm normalizes both sides — so each ref first narrows to candidates
 * by keys every arm implies (the last 4 alphanumerics, the last 8 digits;
 * for tracking the canonical / key-18 / last-8 / raw forms), computed once
 * per order and hash-joined; the imported predicates then decide.
 */
export function buildOutboundRefsSql(orgId: OrgId, refs: readonly string[], withShipped: boolean) {
  const canon: string[] = [];
  const key18: string[] = [];
  const last8: string[] = [];
  const trackish: boolean[] = [];
  const key4: string[] = [];
  const digits8: string[] = [];
  for (const ref of refs) {
    const keys = orderTrackingMatchKeys(ref);
    const digits = ref.replace(/\D/g, '');
    const tail = digits.length >= 8 ? digits.slice(-8) : '';
    canon.push(keys.exact);
    key18.push(keys.key18);
    last8.push(tail);
    trackish.push(looksLikeTrackingIdentifier(ref, tail, keys));
    key4.push(ref.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-4));
    digits8.push(digits.length === 8 ? digits : '');
  }
  const params: unknown[] = [orgId, [...refs], canon, key18, last8, trackish, key4, digits8];
  const trackingMatches = sqlTrackingNumberMatches({
    stnAlias: 'stn_trk',
    likeParam: 'r.ref',
    canonicalParam: 'r.canon',
    key18Param: 'r.key18',
    last8Param: 'r.last8',
  });
  let shipped = 'false';
  if (withShipped) {
    const { conditions } = buildPackerLogBaseWhere({ organizationId: orgId }, params);
    // The order's packages drive the index; `sqlOrderOwnsShipment` decides.
    shipped = `EXISTS (
        SELECT 1
          FROM station_activity_logs sal
          LEFT JOIN packer_logs pl ON pl.id = sal.packer_log_id
         WHERE sal.shipment_id = ANY (ARRAY(
                 SELECT o.shipment_id
                 UNION
                 SELECT sl_own.shipment_id
                   FROM shipment_links sl_own
                  WHERE sl_own.owner_type = 'ORDER' AND sl_own.owner_id = o.id
               ))
           AND ${conditions.join('\n           AND ')}
           AND ${sqlOrderOwnsShipment('o', 'sal.shipment_id')}
      )`;
  }
  const sql = `
    WITH r AS (
      SELECT *
        FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::boolean[], $7::text[], $8::text[])
             WITH ORDINALITY AS r(ref, canon, key18, last8, trackish, key4, digits8, ord)
    ),
    ok AS MATERIALIZED (
      SELECT o.id,
             ${ORDER_KEY_SQL('o.order_id')} AS order_key4,
             ${ORDER_DIGITS8_SQL('o.order_id')} AS order_digits8,
             ${ORDER_KEY_SQL('o.item_number')} AS item_key4,
             ${ORDER_DIGITS8_SQL('o.item_number')} AS item_digits8
        FROM orders o
       WHERE o.organization_id = $1
    ),
    order_candidate AS (
      SELECT r.ord, r.ref, ok.id FROM r JOIN ok ON ok.order_key4 = r.key4
      UNION SELECT r.ord, r.ref, ok.id FROM r JOIN ok ON r.digits8 <> '' AND ok.order_digits8 = r.digits8
      UNION SELECT r.ord, r.ref, ok.id FROM r JOIN ok ON ok.item_key4 = r.key4
      UNION SELECT r.ord, r.ref, ok.id FROM r JOIN ok ON r.digits8 <> '' AND ok.item_digits8 = r.digits8
    ),
    tk AS MATERIALIZED (
      SELECT s.id,
             lower(s.tracking_number_raw) AS raw_lower,
             s.tracking_number_normalized AS normalized,
             right(regexp_replace(upper(COALESCE(s.tracking_number_normalized, '')), '[^A-Z0-9]', '', 'g'), 18) AS key18,
             ${ORDER_DIGITS8_SQL('s.tracking_number_normalized')} AS last8
        FROM shipping_tracking_numbers s
       WHERE EXISTS (SELECT 1 FROM r WHERE r.trackish)
    ),
    tracking_candidate AS (
      SELECT r.ord, tk.id FROM r JOIN tk ON r.trackish AND tk.normalized = r.canon
      UNION SELECT r.ord, tk.id FROM r JOIN tk ON r.trackish AND r.key18 <> '' AND tk.key18 = r.key18
      UNION SELECT r.ord, tk.id FROM r JOIN tk ON r.trackish AND r.last8 <> '' AND tk.last8 = r.last8
      UNION SELECT r.ord, tk.id FROM r JOIN tk ON r.trackish AND tk.raw_lower = lower(r.ref)
    ),
    tracking_hit AS (
      SELECT r.ord, stn_trk.id
        FROM tracking_candidate c
        JOIN r ON r.ord = c.ord
        JOIN shipping_tracking_numbers stn_trk ON stn_trk.id = c.id
       WHERE ${trackingMatches}
    ),
    hit AS (
      SELECT c.ord, o.id
        FROM order_candidate c
        JOIN orders o ON o.id = c.id
       WHERE ${sqlIdentifierEqualsQuery('o.order_id', 'c.ref')}
          OR ${sqlIdentifierEqualsQuery('o.item_number', 'c.ref')}
      UNION
      SELECT t.ord, o.id
        FROM tracking_hit t
        JOIN orders o ON o.organization_id = $1 AND o.shipment_id = t.id
      UNION
      SELECT t.ord, o.id
        FROM tracking_hit t
        JOIN shipment_links sl_trk
          ON sl_trk.shipment_id = t.id
         AND sl_trk.owner_type = 'ORDER'
         AND sl_trk.organization_id = $1
        JOIN orders o ON o.id = sl_trk.owner_id AND o.organization_id = $1
    )
    SELECT h.ord::int AS ord,
           o.id,
           o.order_id,
           o.product_title,
           ${sqlOrderInExceptionQueue('o', 'stn')} AS in_exceptions,
           ${QUEUE_VIEWS.map((view) => `${sqlDeskQueueScope(view)} AS in_${view},`).join('\n           ')}
           ${shipped} AS in_shipped
      FROM hit h
      JOIN orders o ON o.id = h.id
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
     ORDER BY h.ord, o.id`;
  return { sql, params };
}

export interface OutboundLocateResult {
  buckets: NavLocateBucket[];
  entries: NavLocateEntry[];
}

/** Counts for the field's text. `ids` = the caller's buckets. */
export async function locateOutboundText(
  orgId: OrgId,
  ids: readonly DeskViewId[],
  q: string,
  deps: OutboundLocateDeps,
): Promise<OutboundLocateResult> {
  const withShipped = ids.includes('shipped');
  const text = buildOutboundTextCountSql(orgId, q, withShipped);
  const [queueCounts, [textRow]] = await Promise.all([
    Promise.all(
      QUEUE_VIEWS.map(async (view) => {
        const list = await deps.ordersListSql(queueSearchQuery(view, q));
        const [row] = await deps.run(`SELECT COUNT(*)::int AS n FROM (${list.sql}) listed`, list.params);
        return [view, Number(row?.n) || 0] as const;
      }),
    ),
    deps.run(text.sql, text.params),
  ]);
  const counts: Partial<Record<DeskViewId, number>> = Object.fromEntries(queueCounts);
  counts.exceptions = Number(textRow?.exceptions) || 0;
  if (withShipped) counts.shipped = Number(textRow?.shipped) || 0;
  return { buckets: bucketsWith(ids, counts), entries: [] };
}

/** One entry per ref, in paste order; a bucket counts the refs found in it. */
export async function locateOutboundRefs(
  orgId: OrgId,
  ids: readonly DeskViewId[],
  refs: readonly string[],
  deps: Pick<OutboundLocateDeps, 'run'>,
): Promise<OutboundLocateResult> {
  const built = buildOutboundRefsSql(orgId, refs, ids.includes('shipped'));
  const rows = refs.length > 0 ? await deps.run(built.sql, built.params) : [];
  const byRef = new Map<number, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const ord = Number(row.ord);
    const list = byRef.get(ord);
    if (list) list.push(row);
    else byRef.set(ord, [row]);
  }
  const counts: Partial<Record<DeskViewId, number>> = {};
  const entries = refs.map((ref, index): NavLocateEntry => {
    const hits = byRef.get(index + 1) ?? [];
    const buckets = ids.filter((id) => hits.some((hit) => hit[`in_${id}`] === true));
    for (const id of buckets) counts[id] = (counts[id] ?? 0) + 1;
    const lead = hits[0];
    return {
      ref,
      buckets,
      title: lead
        ? [lead.order_id, lead.product_title].filter((part) => part != null && String(part).trim() !== '').join(' · ') || null
        : null,
      detail: hits.length > 1 ? `${hits.length} order lines` : null,
      recordHref: hits.length === 1 ? searchHitHref('ORDER', Number(lead.id)) : null,
    };
  });
  return { buckets: bucketsWith(ids, counts), entries };
}
