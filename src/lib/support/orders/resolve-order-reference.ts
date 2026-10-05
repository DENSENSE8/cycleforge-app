/**
 * Pasted text → the exact local order(s) it names.
 *
 * Staff paste an order number, a marketplace order id, a tracking number, a
 * listing URL or an `orders:<id>` reference; this answers with candidate
 * ORDERS (all lines of a customer order folded into one, keyed by the
 * order's representative `orders.id` — its lowest line id, see
 * order-facts.ts). It never silently picks: more than one distinct order
 * comes back `ambiguous: true` and the caller must make the staffer choose.
 */
import { parseListingUrl } from '@/lib/inventory/listing-candidate';
import { inferMarketplaceFromOrderId, normalizeMarketplaceOrderId } from '@/lib/marketplace-order-id';
import { looksLikeTrackingIdentifier } from '@/lib/search/global-entity-search';
import { sqlIdentifierEqualsQuery } from '@/lib/search/order-number-match';
import { sqlTrackingNumberMatches } from '@/lib/search/order-tracking-match-sql';
import { orderTrackingMatchKeys, trackingDigitsLast8Strict } from '@/lib/tracking-format';
import { tenantQueryOneTrip, withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { SupportOrderRef } from '@/lib/support/conversation/model';
import { loadOrderGroups, supportOrderRefFromGroup, type OrderGroupFacts } from './order-facts';
import { loadOrderPlatformResolver } from './order-platform';

export type OrderReferenceKind = 'order_number' | 'marketplace_id' | 'tracking' | 'listing' | 'order_pk' | 'unknown';

export interface OrderReferenceResolution {
  kind: OrderReferenceKind;
  candidates: SupportOrderRef[];
  /** More than one distinct order matched — the staffer must choose; nothing is linked automatically. */
  ambiguous: boolean;
}

/** What the text looks like, before any lookup. */
export type OrderReferenceShape =
  | { kind: 'unknown' }
  | { kind: 'order_pk'; orderId: number }
  | { kind: 'listing'; itemNumber: string }
  | { kind: 'marketplace_id'; orderNumber: string }
  /** A bare token: an order number first, then a tracking number (when shaped like one), then a listing item number. */
  | { kind: 'token'; text: string; trackingShaped: boolean };

/** Most candidates one paste returns; past this the staffer should paste something sharper. */
export const ORDER_REFERENCE_MAX_CANDIDATES = 20;
const MATCH_LIMIT = 200;

/** `orders:123` / `order:123`, alone or as the `sel=` of a CycleForge search link. */
const ORDER_PK_RE = /^(?:.*[?&]sel=)?orders?:(\d{1,10})(?:&.*)?$/i;

export function classifyOrderReference(raw: string): OrderReferenceShape {
  const text = String(raw ?? '').trim();
  if (!text) return { kind: 'unknown' };

  const pk = ORDER_PK_RE.exec(text);
  if (pk) {
    const orderId = Number(pk[1]);
    if (Number.isSafeInteger(orderId) && orderId > 0) return { kind: 'order_pk', orderId };
  }

  if (/^https?:\/\//i.test(text)) {
    const listing = parseListingUrl(text);
    return listing.ok ? { kind: 'listing', itemNumber: listing.candidate.itemNumber } : { kind: 'unknown' };
  }

  const orderNumber = normalizeMarketplaceOrderId(text);
  if (inferMarketplaceFromOrderId(orderNumber)) return { kind: 'marketplace_id', orderNumber };

  // Carriers print tracking in spaced groups; anything else with spaces is prose.
  const token = /^[\d\s-]+$/.test(text) ? text.replace(/\s+/g, '') : text;
  if (/\s/.test(token) || token.length > 64) return { kind: 'unknown' };
  const keys = orderTrackingMatchKeys(token);
  // No carrier prints a tracking number under 10 characters; a short id (`#5103`) is an order number.
  const trackingShaped =
    token.replace(/[^A-Za-z0-9]/g, '').length >= 10 &&
    looksLikeTrackingIdentifier(token, trackingDigitsLast8Strict(token), keys);
  return { kind: 'token', text: token.replace(/^#+/, ''), trackingShaped };
}

export interface ResolveOrderReferenceDeps {
  /** Line ids for an exact `orders.id`. */
  matchOrderPk(orgId: OrgId, orderId: number): Promise<number[]>;
  /** Line ids whose order number equals the text exactly (`exact`) or by last-8 / chip face (`loose`). */
  matchOrderNumber(orgId: OrgId, text: string): Promise<{ exact: number[]; loose: number[] }>;
  matchTracking(orgId: OrgId, text: string): Promise<number[]>;
  matchItemNumber(orgId: OrgId, itemNumber: string): Promise<number[]>;
  /** Fold matched lines into whole orders. */
  loadGroups(orgId: OrgId, lineIds: number[]): Promise<OrderGroupFacts[]>;
}

/** Exact full-number equality wins over a loose (last-8 / face) match; loose is only the fallback. */
async function byOrderNumber(deps: ResolveOrderReferenceDeps, orgId: OrgId, text: string): Promise<number[]> {
  const { exact, loose } = await deps.matchOrderNumber(orgId, text);
  return exact.length > 0 ? exact : loose;
}

export async function resolveOrderReference(
  orgId: OrgId,
  text: string,
  deps: ResolveOrderReferenceDeps = defaultResolveOrderReferenceDeps,
): Promise<OrderReferenceResolution> {
  const shape = classifyOrderReference(text);
  let kind: OrderReferenceKind;
  let lineIds: number[] = [];

  switch (shape.kind) {
    case 'unknown':
      return { kind: 'unknown', candidates: [], ambiguous: false };
    case 'order_pk':
      kind = 'order_pk';
      lineIds = await deps.matchOrderPk(orgId, shape.orderId);
      break;
    case 'listing':
      kind = 'listing';
      lineIds = await deps.matchItemNumber(orgId, shape.itemNumber);
      break;
    case 'marketplace_id':
      kind = 'marketplace_id';
      lineIds = await byOrderNumber(deps, orgId, shape.orderNumber);
      break;
    case 'token': {
      kind = 'order_number';
      lineIds = await byOrderNumber(deps, orgId, shape.text);
      if (lineIds.length === 0 && shape.trackingShaped) {
        kind = 'tracking';
        lineIds = await deps.matchTracking(orgId, shape.text);
      }
      if (lineIds.length === 0) {
        const byItem = await deps.matchItemNumber(orgId, shape.text);
        if (byItem.length > 0) {
          kind = 'listing';
          lineIds = byItem;
        }
      }
      break;
    }
  }

  if (lineIds.length === 0) return { kind, candidates: [], ambiguous: false };
  const groups = await deps.loadGroups(orgId, lineIds);
  const externalReference = String(text).trim();
  return {
    kind,
    candidates: groups.slice(0, ORDER_REFERENCE_MAX_CANDIDATES).map((group) =>
      supportOrderRefFromGroup(group, {
        orderId: group.representativeOrderId,
        primary: false,
        externalReference,
      }),
    ),
    ambiguous: groups.length > 1,
  };
}

const COMPACT = (expr: string) => `regexp_replace(LOWER(COALESCE(${expr}, '')), '[^a-z0-9]', '', 'g')`;

async function queryLineIds(orgId: OrgId, sql: string, params: unknown[]): Promise<number[]> {
  const res = await tenantQueryOneTrip<{ id: number }>(orgId, sql, params);
  return res.rows.map((r) => Number(r.id));
}

export const defaultResolveOrderReferenceDeps: ResolveOrderReferenceDeps = {
  matchOrderPk: (orgId, orderId) =>
    queryLineIds(orgId, `SELECT o.id FROM orders o WHERE o.organization_id = $1 AND o.id = $2`, [orgId, orderId]),

  async matchOrderNumber(orgId, text) {
    const res = await tenantQueryOneTrip<{ id: number; exact: boolean }>(
      orgId,
      `SELECT o.id,
              (LOWER(BTRIM(o.order_id)) = LOWER(BTRIM($2))
               OR (${COMPACT('$2')} <> '' AND ${COMPACT('o.order_id')} = ${COMPACT('$2')})) AS exact
         FROM orders o
        WHERE o.organization_id = $1
          AND ${sqlIdentifierEqualsQuery('o.order_id', '$2')}
        ORDER BY o.id
        LIMIT ${MATCH_LIMIT}`,
      [orgId, text],
    );
    return {
      exact: res.rows.filter((r) => r.exact === true).map((r) => Number(r.id)),
      loose: res.rows.map((r) => Number(r.id)),
    };
  },

  matchTracking(orgId, text) {
    const keys = orderTrackingMatchKeys(text);
    const matches = sqlTrackingNumberMatches({
      stnAlias: 'stn_trk',
      likeParam: '$2',
      canonicalParam: '$3',
      key18Param: '$4',
      last8Param: '$5',
    });
    return queryLineIds(
      orgId,
      `SELECT o.id
         FROM orders o
        WHERE o.organization_id = $1
          AND (
               o.shipment_id IN (SELECT stn_trk.id FROM shipping_tracking_numbers stn_trk WHERE ${matches})
            OR EXISTS (
                 SELECT 1
                   FROM shipment_links sl_trk
                   JOIN shipping_tracking_numbers stn_trk ON stn_trk.id = sl_trk.shipment_id
                  WHERE sl_trk.owner_type = 'ORDER'
                    AND sl_trk.owner_id = o.id
                    AND sl_trk.organization_id = o.organization_id
                    AND ${matches})
          )
        ORDER BY o.id
        LIMIT ${MATCH_LIMIT}`,
      [orgId, text, keys.exact, keys.key18, trackingDigitsLast8Strict(text)],
    );
  },

  matchItemNumber: (orgId, itemNumber) =>
    queryLineIds(
      orgId,
      `SELECT o.id
         FROM orders o
        WHERE o.organization_id = $1
          AND o.item_number IS NOT NULL
          AND (BTRIM(o.item_number) = BTRIM($2)
               OR (${COMPACT('$2')} <> '' AND ${COMPACT('o.item_number')} = ${COMPACT('$2')}))
        ORDER BY o.id
        LIMIT ${MATCH_LIMIT}`,
      [orgId, itemNumber],
    ),

  async loadGroups(orgId, ids) {
    const resolvePlatform = await loadOrderPlatformResolver(orgId);
    return withTenantConnection(orgId, (client) => loadOrderGroups(client, orgId, ids, resolvePlatform));
  },
};
