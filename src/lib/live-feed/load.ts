/**
 * The Live feed's server reads (`/operations/live-feed`: `GET /api/live-feed`,
 * `/board`, the Copy all, the status counts and the Carrier / Channel facets).
 * Every read is one tenant statement over the status memberships
 * (outbound-sql.ts / inbound-sql.ts) built by feed-sql.ts — narrowed by the
 * date rule, staff, find, channel and carrier — so a count is by construction
 * the list's (or the column's) total. `loadLiveFeed` reads ONE status: its
 * exact count and one page of items; `loadLiveFeedBoard` every status of the
 * direction: exact counts and the first items of each. Both then dress each
 * item with its lead line.
 */

import 'server-only';

import { isIncomingUniversal, isReceivingPhysicalStateFirst, isUnboxRailColumnRead } from '@/lib/feature-flags';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { orderLineImageSql } from '@/lib/photos/order-line-image-sql';
import { resolveSkuIdentityTitle, skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';
import { linePrice } from '@/lib/orders/order-card-model';
import { recordHref } from '@/lib/identify/record-href';
import { sqlTrackingNumberMatches } from '@/lib/search/order-tracking-match-sql';
import { sqlIdentifierEqualsQuery } from '@/lib/search/order-number-match';
import { looksLikeTrackingIdentifier } from '@/lib/search/global-entity-search';
import { looksLikeIdentifier } from '@/lib/search/search-hit';
import { orderTrackingMatchKeys } from '@/lib/tracking-format';
import {
  getLiveFeedStatus,
  isLiveFeedChannel,
  liveFeedAccess,
  liveFeedCarrierLabel,
  liveFeedLensApplies,
  liveFeedStatusesOf,
  type LiveFeedChannel,
  type LiveFeedDirection,
  type LiveFeedStatusId,
  type LiveFeedStatusSpec,
} from '@/lib/live-feed/statuses';
import { LIVE_FEED_BOARD_COLUMN_CAP, LIVE_FEED_BOARD_GROUP_CAP, LIVE_FEED_PAGE_SIZE } from '@/lib/live-feed/route';
import { liveFeedPreviousRange, liveFeedTrackingList, liveFeedWindow } from '@/lib/live-feed/model';
import {
  buildFeedBoardSql,
  buildFeedCountsSql,
  buildFeedMemberRowsSql,
  buildFeedPageSql,
  type FeedBoardRow,
  type FeedCountRow,
  type FeedItemRow,
  type FeedMemberRow,
  type FeedMembership,
  type FeedNarrow,
  type FeedPageRow,
} from '@/lib/live-feed/feed-sql';
import { OUTBOUND_SHIP_FACTS_CTE, outboundMemberships, outboundTrailsSql } from '@/lib/live-feed/outbound-sql';
import { INBOUND_LINES_SQL, inboundMemberships } from '@/lib/live-feed/inbound-sql';
import { IN_PERSON_LINES_SQL, type InPersonLineRow } from '@/lib/live-feed/in-person-lines-sql';
import { LIVE_FEED_ITEM_FLAGS } from '@/lib/live-feed/types';
import type {
  LiveFeedBoard,
  LiveFeedFilters,
  LiveFeedGroup,
  LiveFeedItem,
  LiveFeedItemFlag,
  LiveFeedLine,
  LiveFeedPage,
  LiveFeedStatusFace,
  LiveFeedStatusFilters,
  LiveFeedTracking,
  LiveFeedTrail,
  LiveFeedUrgency,
} from '@/lib/live-feed/types';

/** Binds after the statement's fixed `$1` org, `$2`/`$3` window. */
function binder(params: unknown[]): (value: unknown) => string {
  return (value) => {
    params.push(value);
    return `$${params.length}`;
  };
}

/**
 * Staff / find as one AND-ed predicate over the membership `m` (the channel
 * and carrier picks are bound apart — their facet tallies count before
 * them). The find matches the item's tracking (the `trk` lateral), an
 * in-person record's own id, or — computed once as a CTE, not per row — an
 * order (outbound) or receiving line (inbound) whose number / SKU / PO
 * equals it.
 */
function narrowSql(filters: LiveFeedFilters, direction: LiveFeedDirection, bind: (value: unknown) => string): FeedNarrow {
  const clauses: string[] = [];
  if (filters.staff != null) clauses.push(`m.staff_id = ${bind(filters.staff)}::int`);
  const base = {
    lens: filters.lens,
    carry: filters.carry,
    channelRef: filters.channel ? bind(filters.channel) : null,
    carrierRef: filters.carrier ? bind(filters.carrier) : null,
  };
  // The outbound lanes read the per-shipment facts once per statement.
  const shared = direction === 'outbound' ? [OUTBOUND_SHIP_FACTS_CTE] : [];
  if (!filters.q) return { ...base, sql: clauses.join('\n        AND '), withTracking: false, ctes: shared };

  const q = filters.q;
  const keys = orderTrackingMatchKeys(q);
  const digits = q.replace(/\D/g, '');
  const last8 = digits.length >= 8 ? digits.slice(-8) : '';
  // Only a tracking-shaped find reads the fuzzy key18 / last-8 arms; a short
  // order number or SKU must not match a tracking number's tail.
  const trackingShaped = looksLikeTrackingIdentifier(q, last8, keys);
  const qRef = bind(q);
  const tracking = sqlTrackingNumberMatches({
    stnAlias: 'trk',
    likeParam: bind(looksLikeIdentifier(q) ? q : `%${q}%`),
    canonicalParam: bind(keys.exact),
    key18Param: bind(trackingShaped ? keys.key18 : ''),
    last8Param: bind(trackingShaped ? last8 : ''),
  });
  const recordId = `m.record_id = BTRIM(${qRef})`;
  if (direction === 'outbound') {
    const ctes = [
      `q_orders AS MATERIALIZED (
      SELECT o_q.id, o_q.shipment_id
        FROM orders o_q
       WHERE o_q.organization_id = $1
         AND (${sqlIdentifierEqualsQuery('o_q.order_id', qRef)}
              OR UPPER(BTRIM(o_q.sku)) = UPPER(BTRIM(${qRef})))
    )`,
      // The packages those orders ride in: their own shipment or an ORDER shipment link.
      `q_shipments AS MATERIALIZED (
      SELECT shipment_id FROM q_orders WHERE shipment_id IS NOT NULL
      UNION
      SELECT sl_q.shipment_id
        FROM shipment_links sl_q
        JOIN q_orders ON q_orders.id = sl_q.owner_id
       WHERE sl_q.organization_id = $1 AND sl_q.owner_type = 'ORDER'
    )`,
    ];
    clauses.push(`(${tracking}
        OR ${recordId}
        OR m.order_row_id IN (SELECT id FROM q_orders)
        OR m.shipment_id IN (SELECT shipment_id FROM q_shipments))`);
    return { ...base, sql: clauses.join('\n        AND '), withTracking: true, ctes: [...shared, ...ctes] };
  }
  const ctes = [
    `q_lines AS MATERIALIZED (
      SELECT rl_q.id, rl_q.receiving_id
        FROM receiving_line rl_q
        LEFT JOIN receiving_line_zoho rz_q
          ON rz_q.receiving_line_id = rl_q.id AND rz_q.organization_id = rl_q.organization_id
       WHERE rl_q.organization_id = $1
         AND (UPPER(BTRIM(rl_q.sku)) = UPPER(BTRIM(${qRef}))
              OR ${sqlIdentifierEqualsQuery('rl_q.source_order_id', qRef)}
              OR ${sqlIdentifierEqualsQuery('rz_q.zoho_purchaseorder_number', qRef)})
    )`,
  ];
  clauses.push(`(${tracking}
        OR ${recordId}
        OR ${sqlIdentifierEqualsQuery('m.po_number', qRef)}
        OR m.line_id IN (SELECT id FROM q_lines)
        OR m.receiving_id IN (SELECT receiving_id FROM q_lines WHERE receiving_id IS NOT NULL))`);
  return { ...base, sql: clauses.join('\n        AND '), withTracking: true, ctes };
}

/**
 * The lead order line of each painted outbound package (lowest `orders.id`
 * across the package's own orders and its ORDER shipment links — the
 * Fulfilled card's line order), plus every order an item names directly, and
 * the stage trail of every painted package (`$4`).
 */
const OUTBOUND_LINES_SQL = `
  WITH pkg AS (
    SELECT s.shipment_id, MIN(u.id)::int AS lead_id
    FROM (SELECT DISTINCT unnest($2::bigint[]) AS shipment_id) s
    JOIN LATERAL (
      SELECT o.id FROM orders o
      WHERE o.organization_id = $1 AND o.shipment_id = s.shipment_id
      UNION
      SELECT sl.owner_id FROM shipment_links sl
      WHERE sl.organization_id = $1 AND sl.owner_type = 'ORDER' AND sl.shipment_id = s.shipment_id
    ) u ON TRUE
    GROUP BY s.shipment_id
  ),
  wanted AS (
    SELECT lead_id AS id FROM pkg
    UNION
    SELECT unnest($3::int[])
  ),
  trails AS (${outboundTrailsSql('$4')})
  SELECT
    (SELECT COALESCE(json_agg(pkg), '[]'::json) FROM pkg) AS packages,
    (SELECT COALESCE(json_agg(trails), '[]'::json) FROM trails) AS trails,
    (SELECT COALESCE(json_agg(json_build_object(
        'id', o.id,
        'order_id', o.order_id,
        'sku', o.sku,
        'product_title', o.product_title,
        'zoho_item_title', cxi.external_name,
        'catalog_product_title', sc.product_title,
        'quantity', o.quantity,
        'condition', o.condition,
        'sale_amount', o.sale_amount,
        'currency', o.currency,
        'image_url', ${orderLineImageSql('o')}
      )), '[]'::json)
      FROM wanted w
      JOIN orders o ON o.id = w.id AND o.organization_id = $1
      LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('o', 'sc')}
      LEFT JOIN LATERAL (
        SELECT x.external_name
        FROM catalog_external_ids x
        WHERE x.sku_catalog_id = sc.id
          AND x.organization_id = o.organization_id
          AND x.provider = 'zoho'
        ORDER BY x.id
        LIMIT 1
      ) cxi ON TRUE) AS lines`;

interface OutboundTrailRow {
  shipment_id: number | string;
  packed_at: string | null;
  scanned_out_at: string | null;
  carrier_at: string | null;
  delivered_at: string | null;
}

interface OutboundLineRow {
  id: number;
  order_id: string | null;
  sku: string | null;
  product_title: string | null;
  zoho_item_title: string | null;
  catalog_product_title: string | null;
  quantity: number | string | null;
  condition: string | null;
  sale_amount: number | string | null;
  currency: string | null;
  image_url: string | null;
}

interface InboundLineRow {
  id: number;
  sku: string | null;
  item_name: string | null;
  catalog_product_title: string | null;
  zoho_item_title: string | null;
  quantity: number | string | null;
  condition: string | null;
  unit_cost_cents: number | string | null;
  unit_price: number | string | null;
  currency: string | null;
  image_url: string | null;
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function idOrNull(value: unknown): number | null {
  const n = finiteOrNull(value);
  return n != null && n > 0 ? n : null;
}

interface DressedLine {
  orderId: string | null;
  line: LiveFeedLine;
}

function outboundLine(row: OutboundLineRow): DressedLine {
  return {
    orderId: row.order_id,
    line: {
      title:
        resolveSkuIdentityTitle({
          catalog_product_title: row.catalog_product_title,
          zoho_item_title: row.zoho_item_title,
          item_name: row.product_title,
          sku: row.sku,
        }) || 'Untitled item',
      photoUrl: row.image_url,
      condition: row.condition?.trim() || null,
      qty: finiteOrNull(row.quantity),
      price: linePrice({ sale_amount: row.sale_amount, currency: row.currency }).text,
    },
  };
}

function inboundLine(row: InboundLineRow): LiveFeedLine {
  const cents = finiteOrNull(row.unit_cost_cents);
  return {
    title:
      resolveSkuIdentityTitle({
        catalog_product_title: row.catalog_product_title,
        zoho_item_title: row.zoho_item_title,
        item_name: row.item_name,
        sku: row.sku,
      }) || 'Untitled item',
    photoUrl: row.image_url,
    condition: row.condition,
    qty: finiteOrNull(row.quantity),
    price: linePrice({ sale_amount: cents != null ? cents / 100 : row.unit_price, currency: row.currency }).text,
  };
}

function inPersonLine(row: InPersonLineRow): LiveFeedLine {
  return {
    title:
      resolveSkuIdentityTitle({
        catalog_product_title: row.catalog_product_title,
        zoho_item_title: row.zoho_item_title,
        item_name: row.item_name,
        sku: row.sku,
      }) || 'Untitled item',
    photoUrl: row.image_url,
    condition: row.condition?.trim() || null,
    qty: finiteOrNull(row.quantity),
    price: linePrice({ sale_amount: row.amount, currency: row.currency }).text,
  };
}

/** Outbound lanes whose package has left the building — their record opens on Fulfilled. */
const LEFT_BUILDING: Readonly<Partial<Record<LiveFeedStatusId, true>>> = {
  'out-scanned-out': true,
  'out-in-transit': true,
  'out-delivered': true,
};

/** In-person record families that are not orders or cartons (`FeedItemRow.sub`). */
const IN_PERSON_RECORD_SUBS = ['LOCAL_PICKUP', 'COUNTER', 'SQUARE'] as const;
type InPersonRecordSub = (typeof IN_PERSON_RECORD_SUBS)[number];

function inPersonRecordSub(sub: string | null): InPersonRecordSub | null {
  return (IN_PERSON_RECORD_SUBS as readonly string[]).includes(sub ?? '') ? (sub as InPersonRecordSub) : null;
}

/** An in-person record's own handle (no tracking / order / PO speaks for it). */
function inPersonRef(sub: InPersonRecordSub, id: string | null): string {
  if (sub === 'SQUARE') return 'Square sale';
  return `${sub === 'COUNTER' ? 'Visit' : 'Pickup'} ${id ?? ''}`.trim();
}

function outboundHref(statusId: LiveFeedStatusId, row: FeedItemRow, orderRowId: number | null, shipmentId: number | null): string | null {
  // A counter visit / Square sale has no record page.
  if (inPersonRecordSub(row.sub)) return null;
  if (LEFT_BUILDING[statusId] && shipmentId != null) {
    return recordHref({ kind: 'order', entityId: orderRowId ?? shipmentId, deskView: 'shipped', shipmentId });
  }
  return orderRowId == null ? null : recordHref({ kind: 'order', entityId: orderRowId, deskView: 'triage', shipmentId });
}

function inboundHref(row: FeedItemRow): string | null {
  // The local pickup record: `/pickup?lcpu=` (receiving-routes.ts).
  if (row.sub === 'LOCAL_PICKUP' && row.record_id) return `/pickup?${new URLSearchParams({ lcpu: row.record_id }).toString()}`;
  const receivingId = idOrNull(row.receiving_id);
  return receivingId != null ? recordHref({ kind: 'receiving', entityId: receivingId }) : null;
}

const URGENCIES: Readonly<Record<string, LiveFeedUrgency>> = { late: 'late', due_today: 'due_today', aging: 'aging' };

interface DirectionStatement {
  memberships: FeedMembership[];
  narrow: FeedNarrow;
  params: unknown[];
  bind: (value: unknown) => string;
}

/**
 * One direction's memberships of `specs` under `range`, its narrowing and
 * binds — shared by every read. A lane the lens does not apply to, or (on a
 * staff-scoped feed) one that attributes nobody, is never asked.
 */
async function directionStatement(
  organizationId: OrgId,
  direction: LiveFeedDirection,
  specs: readonly LiveFeedStatusSpec[],
  filters: LiveFeedFilters,
  range: Pick<LiveFeedFilters, 'from' | 'to' | 'timeFrom' | 'timeTo'> = filters,
): Promise<DirectionStatement> {
  const window = liveFeedWindow(range);
  const params: unknown[] = [organizationId, window.fromIso, window.toIso];
  const bind = binder(params);
  const asked = specs.filter(
    (spec) => liveFeedLensApplies(spec, filters.lens) && (filters.staff == null || spec.staffLabel != null),
  );
  let memberships: FeedMembership[];
  if (direction === 'outbound') {
    memberships = outboundMemberships(asked);
  } else {
    memberships = inboundMemberships(asked, {
      universalIncoming: await isIncomingUniversal(organizationId),
      unboxRailColumnRead: isUnboxRailColumnRead(),
      scannedZohoExclusion: !isReceivingPhysicalStateFirst(),
    });
  }
  return { memberships, narrow: narrowSql(filters, direction, bind), params, bind };
}

/** The status `filters` names, when the viewer may see its direction; else null. */
function visibleStatus(filters: LiveFeedStatusFilters, permissions: ReadonlySet<string>): LiveFeedStatusSpec | null {
  const spec = getLiveFeedStatus(filters.status);
  return liveFeedAccess(permissions)[spec.direction] ? spec : null;
}

function statusFace(spec: LiveFeedStatusSpec): LiveFeedStatusFace {
  return {
    id: spec.id,
    label: spec.label,
    hint: spec.hint,
    kind: spec.kind,
    section: spec.section,
    staffLabel: spec.staffLabel,
    channels: spec.channels,
  };
}

/** A tally list as stored (`[{ key, count }]`), numbers coerced. */
function tallies(raw: Array<{ key: string; count: number }> | null | undefined): Array<{ key: string; count: number }> {
  return (raw ?? []).map((t) => ({ key: String(t.key), count: Number(t.count) || 0 }));
}

/** Per lane: exact count (after both picks), carrier tallies (before the carrier pick), channel tallies (before the channel pick). */
export interface LiveFeedStatusCount {
  count: number;
  carriers: Array<{ key: string; count: number }>;
  channels: Array<{ key: LiveFeedChannel; count: number }>;
}

/** `specs` counted under the filters over `range` — one counts statement; a lane never asked (lens / staff) counts 0. */
async function countSpecs(
  organizationId: OrgId,
  filters: LiveFeedFilters,
  specs: readonly LiveFeedStatusSpec[],
  range: Pick<LiveFeedFilters, 'from' | 'to' | 'timeFrom' | 'timeTo'>,
): Promise<Partial<Record<LiveFeedStatusId, LiveFeedStatusCount>>> {
  const out: Partial<Record<LiveFeedStatusId, LiveFeedStatusCount>> = Object.fromEntries(
    specs.map((spec) => [spec.id, { count: 0, carriers: [], channels: [] }]),
  );
  const statement = await directionStatement(organizationId, filters.dir, specs, filters, range);
  if (statement.memberships.length === 0) return out;
  const { rows } = await tenantQueryOneTrip<FeedCountRow>(
    organizationId,
    buildFeedCountsSql(statement.memberships, statement.narrow),
    statement.params,
  );
  for (const row of rows) {
    out[row.status_id] = {
      count: Number(row.count) || 0,
      carriers: tallies(row.carriers),
      channels: tallies(row.channels).flatMap((t) => (isLiveFeedChannel(t.key) ? [{ key: t.key, count: t.count }] : [])),
    };
  }
  return out;
}

/**
 * Lanes of `filters.dir` counted under the filters (`status` and `page`
 * ignored) — every lane, or just `only`. The view switcher's counts, the
 * Carrier and Channel facets' tallies. A lane outside the channel pick still
 * answers (count 0, its channel tallies intact) so the Channel facet can
 * offer the way back. Empty when the viewer may not see the direction; a lane
 * the lens does not apply to, or a staff-scoped lane that attributes nobody,
 * counts 0.
 */
export async function countLiveFeedStatuses(
  organizationId: OrgId,
  filters: LiveFeedFilters,
  permissions: ReadonlySet<string>,
  only?: readonly LiveFeedStatusId[],
): Promise<Partial<Record<LiveFeedStatusId, LiveFeedStatusCount>>> {
  if (!liveFeedAccess(permissions)[filters.dir]) return {};
  const specs = liveFeedStatusesOf(filters.dir).filter((spec) => !only || only.includes(spec.id));
  return countSpecs(organizationId, filters, specs, filters);
}

/**
 * Every tracking number of the lane under the feed's filters — unpaged,
 * deduped, in lane order (the Copy all). Null when the viewer may not see
 * the lane's direction.
 */
export async function loadLiveFeedTracking(
  organizationId: OrgId,
  filters: LiveFeedStatusFilters,
  permissions: ReadonlySet<string>,
): Promise<LiveFeedTracking | null> {
  const spec = visibleStatus(filters, permissions);
  if (!spec) return null;
  const statement = await directionStatement(organizationId, spec.direction, [spec], filters);
  const membership = statement.memberships[0];
  if (!membership) return { status: spec.id, count: 0, tracking: [] };
  const { rows } = await tenantQueryOneTrip<FeedMemberRow>(
    organizationId,
    buildFeedMemberRowsSql(membership, statement.narrow),
    statement.params,
  );
  return { status: spec.id, count: rows.length, tracking: liveFeedTrackingList(rows) };
}

/**
 * Dress raw rows of one direction with their lead lines and record links —
 * outbound by order (else the package's lead order), inbound by line (else
 * the carton's lead line), in person by the record's first line — and each
 * outbound package with its stage trail.
 */
async function dressItems(
  organizationId: OrgId,
  direction: LiveFeedDirection,
  rows: ReadonlyArray<{ statusId: LiveFeedStatusId; row: FeedItemRow }>,
): Promise<LiveFeedItem[]> {
  const shipmentIds = new Set<number>();
  const orderIds = new Set<number>();
  const lineIds = new Set<number>();
  const cartonIds = new Set<number>();
  const pickupIds = new Set<number>();
  const counterIds = new Set<number>();
  const squareIds = new Set<string>();
  const trailIds = new Set<number>();
  for (const { row } of rows) {
    const sub = inPersonRecordSub(row.sub);
    if (sub) {
      if (!row.record_id) continue;
      if (sub === 'SQUARE') squareIds.add(row.record_id);
      else {
        const id = idOrNull(row.record_id);
        if (id != null) (sub === 'COUNTER' ? counterIds : pickupIds).add(id);
      }
      continue;
    }
    if (direction === 'outbound') {
      const orderRowId = idOrNull(row.order_row_id);
      const shipmentId = idOrNull(row.shipment_id);
      if (shipmentId != null) trailIds.add(shipmentId);
      if (orderRowId != null) orderIds.add(orderRowId);
      else if (shipmentId != null) shipmentIds.add(shipmentId);
    } else {
      const lineId = idOrNull(row.line_id);
      const receivingId = idOrNull(row.receiving_id);
      if (lineId != null) lineIds.add(lineId);
      else if (receivingId != null) cartonIds.add(receivingId);
    }
  }
  const [outLines, inLines, personLines] = await Promise.all([
    shipmentIds.size + orderIds.size + trailIds.size > 0
      ? tenantQueryOneTrip<{
          packages: Array<{ shipment_id: number | string; lead_id: number }>;
          trails: OutboundTrailRow[];
          lines: OutboundLineRow[];
        }>(organizationId, OUTBOUND_LINES_SQL, [organizationId, [...shipmentIds], [...orderIds], [...trailIds]])
      : null,
    lineIds.size + cartonIds.size > 0
      ? tenantQueryOneTrip<{ cartons: Array<{ receiving_id: number; lead_id: number }>; lines: InboundLineRow[] }>(
          organizationId,
          INBOUND_LINES_SQL,
          [organizationId, [...lineIds], [...cartonIds]],
        )
      : null,
    pickupIds.size + counterIds.size + squareIds.size > 0
      ? tenantQueryOneTrip<InPersonLineRow>(organizationId, IN_PERSON_LINES_SQL, [
          organizationId,
          [...pickupIds],
          [...counterIds],
          [...squareIds],
        ])
      : null,
  ]);
  const outRow = outLines?.rows[0];
  const orderLineById = new Map((outRow?.lines ?? []).map((line) => [Number(line.id), outboundLine(line)]));
  const leadOrderByShipment = new Map((outRow?.packages ?? []).map((pkg) => [Number(pkg.shipment_id), Number(pkg.lead_id)]));
  const trailByShipment = new Map(
    (outRow?.trails ?? []).map((t): [number, LiveFeedTrail] => [
      Number(t.shipment_id),
      { packedAt: t.packed_at, scannedOutAt: t.scanned_out_at, carrierAt: t.carrier_at, deliveredAt: t.delivered_at },
    ]),
  );
  const inRow = inLines?.rows[0];
  const receivingLineById = new Map((inRow?.lines ?? []).map((line) => [Number(line.id), inboundLine(line)]));
  const leadLineByCarton = new Map((inRow?.cartons ?? []).map((c) => [Number(c.receiving_id), Number(c.lead_id)]));
  const personLineByRecord = new Map((personLines?.rows ?? []).map((line) => [`${line.sub}:${line.record_id}`, inPersonLine(line)]));

  return rows.map(({ statusId, row }): LiveFeedItem => {
    const shipmentId = idOrNull(row.shipment_id);
    const receivingId = idOrNull(row.receiving_id);
    const sub = inPersonRecordSub(row.sub);
    let orderRowId: number | null = null;
    let orderId: string | null = null;
    let line: LiveFeedLine | null = null;
    if (sub) {
      line = personLineByRecord.get(`${sub}:${row.record_id}`) ?? null;
    } else if (direction === 'outbound') {
      orderRowId = idOrNull(row.order_row_id) ?? (shipmentId != null ? (leadOrderByShipment.get(shipmentId) ?? null) : null);
      const dressed = orderRowId != null ? orderLineById.get(orderRowId) : undefined;
      orderId = dressed?.orderId ?? null;
      line = dressed?.line ?? null;
    } else {
      const lineId = idOrNull(row.line_id) ?? (receivingId != null ? (leadLineByCarton.get(receivingId) ?? null) : null);
      line = lineId != null ? (receivingLineById.get(lineId) ?? null) : null;
    }
    const trail = !sub && direction === 'outbound' && shipmentId != null ? trailByShipment.get(shipmentId) : undefined;
    return {
      key: row.key,
      statusId,
      direction,
      channel: isLiveFeedChannel(row.channel) ? row.channel : 'online',
      at: row.at,
      staffId: row.staff_id,
      staffName: row.staff_name,
      tracking: row.tracking?.trim() || null,
      carrier: row.carrier,
      orderId,
      poNumber: row.po_number?.trim() || null,
      ref: sub ? inPersonRef(sub, row.record_id) : null,
      customer: row.customer?.trim() || null,
      shipmentId,
      receivingId,
      reason: row.reason,
      urgency: row.urgency ? (URGENCIES[row.urgency] ?? null) : null,
      sub: row.sub,
      flags: (row.flags ?? []).filter((flag): flag is LiveFeedItemFlag => (LIVE_FEED_ITEM_FLAGS as readonly string[]).includes(flag)),
      line,
      ...(trail ? { trail } : {}),
      href: direction === 'outbound' ? outboundHref(statusId, row, orderRowId, shipmentId) : inboundHref(row),
    };
  });
}

/** ONE lane: its exact count and page `filters.page` of its items, dressed. Null when the viewer may not see its direction. */
export async function loadLiveFeed(
  organizationId: OrgId,
  filters: LiveFeedStatusFilters,
  permissions: ReadonlySet<string>,
): Promise<LiveFeedPage | null> {
  const spec = visibleStatus(filters, permissions);
  if (!spec) return null;
  const statement = await directionStatement(organizationId, spec.direction, [spec], filters);
  const membership = statement.memberships[0];
  let count = 0;
  let rows: FeedItemRow[] = [];
  if (membership) {
    const limitRef = statement.bind(LIVE_FEED_PAGE_SIZE);
    const offsetRef = statement.bind((filters.page - 1) * LIVE_FEED_PAGE_SIZE);
    const { rows: result } = await tenantQueryOneTrip<FeedPageRow>(
      organizationId,
      buildFeedPageSql(membership, statement.narrow, { limitRef, offsetRef }),
      statement.params,
    );
    count = Number(result[0]?.count) || 0;
    rows = result[0]?.items ?? [];
  }
  const items = await dressItems(
    organizationId,
    spec.direction,
    rows.map((row) => ({ statusId: spec.id, row })),
  );
  return {
    filters,
    status: { ...statusFace(spec), applicable: liveFeedLensApplies(spec, filters.lens), count },
    items,
    page: filters.page,
    pageSize: LIVE_FEED_PAGE_SIZE,
  };
}

/**
 * The Board: every lane of `filters.dir` inside the channel pick, in pipeline
 * order — each its exact count, late count, oldest instant (open lanes),
 * carried-over count (open lanes), top {@link LIVE_FEED_BOARD_GROUP_CAP}
 * groups and its first {@link LIVE_FEED_BOARD_COLUMN_CAP} items (late first),
 * dressed, in one statement; plus each done lane's count over the previous
 * equal period (one counts statement, the same builder). A lane the lens does
 * not apply to answers `applicable: false`, empty. Null when the viewer may
 * not see the direction.
 */
export async function loadLiveFeedBoard(
  organizationId: OrgId,
  filters: LiveFeedFilters,
  permissions: ReadonlySet<string>,
): Promise<LiveFeedBoard | null> {
  if (!liveFeedAccess(permissions)[filters.dir]) return null;
  const boardFilters = { ...filters, status: null, page: 1 };
  const specs = liveFeedStatusesOf(filters.dir, filters.channel);
  const doneSpecs = specs.filter((spec) => spec.kind === 'done');
  const [statement, previous] = await Promise.all([
    directionStatement(organizationId, filters.dir, specs, boardFilters),
    doneSpecs.length > 0
      ? countSpecs(organizationId, boardFilters, doneSpecs, liveFeedPreviousRange(filters))
      : Promise.resolve<Partial<Record<LiveFeedStatusId, LiveFeedStatusCount>>>({}),
  ]);
  const byStatus = new Map<LiveFeedStatusId, FeedBoardRow>();
  if (statement.memberships.length > 0) {
    const capRef = statement.bind(LIVE_FEED_BOARD_COLUMN_CAP);
    const groupCapRef = statement.bind(LIVE_FEED_BOARD_GROUP_CAP);
    const { rows } = await tenantQueryOneTrip<FeedBoardRow>(
      organizationId,
      buildFeedBoardSql(statement.memberships, statement.narrow, { capRef, groupCapRef }),
      statement.params,
    );
    for (const row of rows) byStatus.set(row.status_id, row);
  }
  const flat = specs.flatMap((spec) => (byStatus.get(spec.id)?.items ?? []).map((row) => ({ statusId: spec.id, row })));
  const dressed = await dressItems(organizationId, filters.dir, flat);
  const itemsByStatus = new Map<LiveFeedStatusId, LiveFeedItem[]>();
  for (const item of dressed) {
    const list = itemsByStatus.get(item.statusId);
    if (list) list.push(item);
    else itemsByStatus.set(item.statusId, [item]);
  }
  return {
    filters: boardFilters,
    columns: specs.map((spec) => {
      const row = byStatus.get(spec.id);
      const groups = (row?.groups.top ?? []).map(
        (g): LiveFeedGroup => ({
          key: String(g.key),
          label:
            spec.groupBy === 'carrier'
              ? liveFeedCarrierLabel(g.key)
              : (g.label?.trim() || (g.key === 'unassigned' ? 'Unassigned' : `Staff #${g.key}`)),
          count: Number(g.count) || 0,
        }),
      );
      return {
        status: statusFace(spec),
        applicable: liveFeedLensApplies(spec, filters.lens),
        count: Number(row?.count) || 0,
        lateCount: Number(row?.late_count) || 0,
        oldestAt: row?.oldest_at != null ? new Date(row.oldest_at).toISOString() : null,
        ...(spec.kind === 'open'
          ? { carriedOver: Number(row?.carried_over) || 0 }
          : { previousCount: previous[spec.id]?.count ?? 0 }),
        groups,
        groupsMore: Math.max(0, (Number(row?.groups.total) || 0) - groups.length),
        items: itemsByStatus.get(spec.id) ?? [],
      };
    }),
  };
}
