/**
 * Outbound locator — where an order lives on the Shipping desk. One bucket
 * per desk view (`DESK_VIEWS`, in `DESK_VIEW_ORDER`), each counted with the
 * SAME predicate that view's list reads:
 *
 * - Allocate (and any view whose rows are `/api/orders` rows):
 *   `sqlDeskQueueScope` (`/api/orders` with the flags the desk sends —
 *   `inWarehouse=true` plus the view's defining params);
 * - Shipped: `buildPackerLogBaseWhere` (`/api/packerlogs`), one row per
 *   package, with no date window — where an order lives, not what this week
 *   shows. Its href opens the list on the same window (`allDates=1`), so the
 *   rows after the click are the count.
 *
 * `q` (the field's text) counts what each view's own find matches: the queue
 * views run their list SQL (`buildOrdersListSql`, search included) wrapped in
 * a count; Shipped adds `sqlPackerLogSearch`. Exceptions never appear as an
 * FBM locator bucket; their only navigation home is `/exceptions`.
 *
 * `refs` (a pasted list) matches each ref exactly — order number / item
 * number (`sqlIdentifierEqualsQuery`: whole, last 8, or the face the row's id
 * chip prints, e.g. `1909809` for `113-6729910-1909809`) or tracking
 * (`sqlTrackingNumberMatches`, gated by `looksLikeTrackingIdentifier`), the
 * header find's identifier arm — and reads every bucket's membership per
 * matched order in one statement, with the order's row facts (`NavLocateFacts`:
 * status, ship-by, packer, packed / scanned-out stamps, tracking, SKU / title)
 * off the To-ship list's own joins (`WA_DEADLINE_LATERAL`,
 * `ORDER_STAGE_FACTS_JOIN`, `SHIP_OUT_LATERAL`) in that same statement.
 */

import type { NavLocateBucket, NavLocateEntry } from '@/lib/nav/context/schema';
import {
  BUYER_CANCEL_BUCKET_ID,
  BUYER_CANCEL_LABEL,
  locateBucketsForBuyerCancel,
} from '@/lib/orders/buyer-cancelled';
import { orderRecordHref } from '@/lib/search/search-hit';
import { outboundFacts } from '@/lib/nav/locate/outbound-facts';
import { buildPackerLogBaseWhere, sqlPackerLogSearch } from '@/lib/neon/packer-logs-week';
import { SHIP_OUT_LATERAL } from '@/lib/neon/orders-queries';
import { sqlDeskQueueScope } from '@/lib/orders/desk-view-sql';
import { ORDER_STAGE_FACTS_JOIN } from '@/lib/orders/order-stage-facts';
import { WA_DEADLINE_LATERAL } from '@/lib/orders/orders-list';
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
import { recordDetailsHref } from '@/lib/records/record-details';
import { escapeLike } from '@/lib/sql-like';
import type { OrgId } from '@/lib/tenancy/constants';
import { orderTrackingMatchKeys, trackingDigitsLast8Strict } from '@/lib/tracking-format';
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
  return DESK_VIEW_ORDER.filter((id) => id !== 'exceptions' && (id !== 'shipped' || permissions.has(SHIPPED_BUCKET_PERMISSION)));
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

/** Optional Shipped count for the field's text — one statement. */
export function buildOutboundTextCountSql(orgId: OrgId, q: string, withShipped: boolean) {
  const params: unknown[] = [orgId];
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
  const sql = `SELECT 0::int AS unused${shipped}`;
  return { sql, params };
}

/**
 * Order-side candidate keys. Each is the expression of an
 * `(organization_id, <key>)` index (migration `2026-10-04_locate_bulk_keys`),
 * so a ref probes the index instead of normalizing every order of the org.
 */
const ORDER_KEY_SQL = (column: string) => `right(regexp_replace(lower(COALESCE(${column}, '')), '[^a-z0-9]', '', 'g'), 4)`;
const ORDER_DIGITS8_SQL = (column: string) => `right(regexp_replace(COALESCE(${column}, ''), '[^0-9]', '', 'g'), 8)`;
/** Tracking-side candidate keys, spelled as the `shipping_tracking_numbers` index expressions. */
const STN_KEY18_SQL = `right(regexp_replace(upper(COALESCE(s.tracking_number_normalized, '')), '[^A-Z0-9]', '', 'g'), 18)`;
const STN_LAST8_SQL = `right(regexp_replace(s.tracking_number_normalized, '\\D', '', 'g'), 8)`;

/**
 * One statement: every order each ref names, with its membership in every bucket.
 *
 * The match is the header find's identifier arm, exactly. Its predicates
 * normalize both sides, so each ref first narrows to candidates by keys every
 * arm implies — the last 4 alphanumerics and the last 8 digits of an order /
 * item number (the chip face ends in the former); for tracking the canonical /
 * key-18 / last-8 / raw forms — each an indexed lookup; the imported
 * predicates then decide.
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
    const tail = trackingDigitsLast8Strict(digits);
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
                  WHERE sl_own.organization_id = o.organization_id AND sl_own.owner_type = 'ORDER' AND sl_own.owner_id = o.id
               ))
           AND ${conditions.join('\n           AND ')}
           AND ${sqlOrderOwnsShipment('o', 'sal.shipment_id')}
      )`;
  }
  const orderArm = (key: string, ref: string) => `SELECT r.ord, r.ref, o.id
        FROM r
        JOIN orders o ON o.organization_id = $1 AND ${key} = ${ref}`;
  const sql = `
    WITH r AS (
      SELECT *
        FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::boolean[], $7::text[], $8::text[])
             WITH ORDINALITY AS r(ref, canon, key18, last8, trackish, key4, digits8, ord)
    ),
    order_candidate AS (
      ${orderArm(ORDER_KEY_SQL('o.order_id'), 'r.key4')}
      UNION ${orderArm(ORDER_DIGITS8_SQL('o.order_id'), 'NULLIF(r.digits8, \'\')')}
      UNION ${orderArm(ORDER_KEY_SQL('o.item_number'), 'r.key4')}
      UNION ${orderArm(ORDER_DIGITS8_SQL('o.item_number'), 'NULLIF(r.digits8, \'\')')}
    ),
    tracking_candidate AS (
      SELECT r.ord, s.id FROM r JOIN shipping_tracking_numbers s ON r.trackish AND s.tracking_number_normalized = r.canon
      UNION SELECT r.ord, s.id FROM r JOIN shipping_tracking_numbers s ON r.trackish AND ${STN_KEY18_SQL} = NULLIF(r.key18, '')
      UNION SELECT r.ord, s.id FROM r JOIN shipping_tracking_numbers s ON r.trackish AND ${STN_LAST8_SQL} = NULLIF(r.last8, '')
      UNION SELECT r.ord, s.id FROM r JOIN shipping_tracking_numbers s ON r.trackish AND lower(s.tracking_number_raw) = lower(r.ref)
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
           ${QUEUE_VIEWS.map((view) => `${sqlDeskQueueScope(view)} AS in_${view},`).join('\n           ')}
           ${shipped} AS in_shipped,
           o.status,
           to_char(wa_deadline.deadline_at, 'YYYY-MM-DD') AS ship_by_date,
           COALESCE(sc.product_title, o.product_title) AS fact_title,
           COALESCE(sc.sku, o.sku) AS sku,
           stn.tracking_number_raw AS tracking_number,
           stn.delivered_at,
           -- Who picked it, and when (the picked-by resolver, materialized on the facts row).
           osf.picked_at,
           osf.picked_by,
           osf.picked_source,
           staff_picked.name AS picked_by_name,
           COALESCE(osf.packed_at, osf.pack_activity_at) AS packed_at,
           COALESCE(osf.packed_by, osf.packer_id) AS packer_id,
           staff_packer.name AS packer_name,
           -- Left the warehouse: the dock scan-out, else the packer log the Shipped list reads.
           COALESCE(ship_out.ship_confirmed_at, osf.packed_at) AS shipped_at
      FROM hit h
      JOIN orders o ON o.id = h.id
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
      ${WA_DEADLINE_LATERAL}
      ${ORDER_STAGE_FACTS_JOIN}
      LEFT JOIN staff staff_picked
        ON staff_picked.id = osf.picked_by
       AND staff_picked.organization_id = o.organization_id
      -- Who packed it, else who it is assigned to pack (the Pack field's \`packed_by_name|packer_name\`).
      LEFT JOIN staff staff_packer
        ON staff_packer.id = COALESCE(osf.packed_by, osf.packer_id)
       AND staff_packer.organization_id = o.organization_id
      ${SHIP_OUT_LATERAL}
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
  let buyerCancels = 0;
  const entries = refs.map((ref, index): NavLocateEntry => {
    const hits = byRef.get(index + 1) ?? [];
    const lead = hits[0];
    const membership = ids.filter((id) => hits.some((hit) => hit[`in_${id}`] === true));
    const buckets = locateBucketsForBuyerCancel(lead?.status, membership);
    const buyerCancel = buckets.length === 1 && buckets[0] === BUYER_CANCEL_BUCKET_ID;
    if (buyerCancel) buyerCancels += 1;
    else for (const id of buckets) if (isDeskBucket(id)) counts[id] = (counts[id] ?? 0) + 1;
    return {
      ref,
      buckets,
      title: lead
        ? [lead.order_id, lead.product_title].filter((part) => part != null && String(part).trim() !== '').join(' · ') || null
        : null,
      detail: hits.length > 1 ? `${hits.length} order lines` : null,
      // The order card's own open (`/shipping/orders?openOrderId=`); a package that left opens on Fulfilled.
      // A buyer cancel opens the search record, which paints "Buyer cancel".
      recordHref:
        hits.length !== 1 || !lead
          ? null
          : buyerCancel
            ? orderRecordHref(Number(lead.id))
            : recordDetailsHref({
                kind: 'order',
                orderId: Number(lead.id),
                shipped: buckets.length > 0 && buckets.every((id) => id === 'shipped'),
              }),
      facts: lead ? outboundFacts(lead, hits.length) : null,
    };
  });
  const buckets = bucketsWith(ids, counts);
  if (buyerCancels > 0) {
    buckets.push({
      id: BUYER_CANCEL_BUCKET_ID,
      label: BUYER_CANCEL_LABEL,
      tone: 'warning',
      href: null,
      count: buyerCancels,
    });
  }
  return { buckets, entries };
}

function isDeskBucket(id: string): id is DeskViewId {
  return id === 'triage' || id === 'exceptions' || id === 'shipped';
}
