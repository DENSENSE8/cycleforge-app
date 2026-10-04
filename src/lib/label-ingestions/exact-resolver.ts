import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ExactOrderIdentity, LabelMatchMethod, LabelQuarantineReasonCode, ParsedLabelEvidence } from './types';

type Queryable = Pick<PoolClient, 'query'>;

export interface LabelOrderResolution { exactOrder: ExactOrderIdentity | null; orderIds: number[]; quarantineReason: LabelQuarantineReasonCode | null; }

/** One logical order (every `orders` row sharing account + order number) a buyer name points at. */
export interface BuyerOrderCandidate {
  /** Lowest `orders.id` of the logical order — the id a paired label carries. */
  orderId: number;
  orderIds: number[];
  accountSource: string;
  orderRef: string;
  /** The buyer name as the order carries it. */
  buyerName: string;
  orderedAt: string | null;
  /** Already holds a shipping label (tracking, a paired label, or an in-app purchase). */
  labeled: boolean;
}

/** `Manuel de Jesús Ramos` / `MANUEL DE JESUS RAMOS` → `MANUEL DE JESUS RAMOS`. */
export function normalizeBuyerName(raw: string): string {
  return raw.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

/**
 * Same buyer: identical normalized names, or the same first and last word —
 * `WILLIAM E KEELER` is the order's `William Keeler`. Never a partial word.
 */
export function sameBuyer(label: string, order: string): boolean {
  if (label === order) return true;
  const a = label.split(' ');
  const b = order.split(' ');
  return a.length > 1 && b.length > 1 && a[0] === b[0] && a[a.length - 1] === b[b.length - 1];
}

/** The SQL fold matching `normalizeBuyerName` closely enough to prefilter on one word. */
const FOLDED_BUYER_SQL = `translate(upper(buyer), 'ÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ', 'AAAAAAEEEEIIIIOOOOOUUUUNC')`;

/**
 * Open logical orders whose buyer is the label's ship-to name, each with
 * whether it already holds a label (`excludeIngestionId` = the label asking,
 * which must not count against its own order). Buyer = the ShipStation
 * ship-to name, then the customer book's display / customer / first + last
 * name — the same order the order card reads.
 */
export async function findBuyerOrders(client: Queryable, organizationId: OrgId, shipToName: string, excludeIngestionId: number | null): Promise<BuyerOrderCandidate[]> {
  const key = normalizeBuyerName(shipToName);
  const words = key.split(' ').filter(Boolean);
  if (words.length < 2) return [];
  const rows = await client.query<{ id: number; account_source: string; order_id: string; ordered_at: Date | null; buyer: string }>(
    `WITH named AS (
       SELECT o.id, o.account_source, o.order_id, COALESCE(o.order_date, o.created_at) AS ordered_at,
              unnest(ARRAY[ss.ship_to->>'name', c.display_name, c.customer_name,
                           NULLIF(btrim(concat_ws(' ', c.first_name, c.last_name)), '')]) AS buyer
         FROM orders o
         LEFT JOIN customers c ON c.organization_id = o.organization_id AND c.id = o.customer_id
         LEFT JOIN LATERAL (
           SELECT r.ship_to FROM shipstation_order_refs r
            WHERE r.organization_id = o.organization_id AND r.order_row_id = o.id
            ORDER BY r.last_seen_at DESC LIMIT 1
         ) ss ON true
        WHERE o.organization_id = $1
          AND o.status IS DISTINCT FROM 'shipped'
          AND NULLIF(btrim(o.account_source), '') IS NOT NULL
          AND NULLIF(btrim(o.order_id), '') IS NOT NULL
     )
     SELECT id, account_source, order_id, ordered_at, buyer FROM named
      WHERE buyer IS NOT NULL AND ${FOLDED_BUYER_SQL} LIKE $2
      ORDER BY id ASC`,
    [organizationId, `%${words[words.length - 1]}%`],
  );
  const byOrder = new Map<string, BuyerOrderCandidate>();
  for (const row of rows.rows) {
    if (!sameBuyer(key, normalizeBuyerName(row.buyer))) continue;
    const id = Number(row.id);
    const logical = `${row.account_source}\u0000${row.order_id}`;
    const existing = byOrder.get(logical);
    const orderedAt = row.ordered_at == null ? null : new Date(row.ordered_at).toISOString();
    if (existing) {
      if (!existing.orderIds.includes(id)) existing.orderIds.push(id);
      if (orderedAt && (!existing.orderedAt || orderedAt > existing.orderedAt)) existing.orderedAt = orderedAt;
    } else {
      byOrder.set(logical, { orderId: id, orderIds: [id], accountSource: row.account_source, orderRef: row.order_id, buyerName: row.buyer.trim(), orderedAt, labeled: false });
    }
  }
  const candidates = [...byOrder.values()];
  if (!candidates.length) return candidates;
  // A buyer's multi-product order is several rows of one logical order; the
  // label check covers every row of it.
  const labeled = await client.query<{ id: number }>(
    `SELECT o.id FROM orders o
      WHERE o.organization_id = $1 AND o.id = ANY($2::int[])
        AND (o.shipment_id IS NOT NULL
             OR EXISTS (SELECT 1 FROM label_ingestions li
                         WHERE li.organization_id = o.organization_id AND li.matched_order_id = o.id
                           AND li.id IS DISTINCT FROM $3::bigint
                           AND li.state IN ('MATCHED', 'APPLYING', 'APPLIED', 'LINKED'))
             OR EXISTS (SELECT 1 FROM shipping_label_purchases p
                         WHERE p.organization_id = o.organization_id AND p.order_id = o.id
                           AND NOT p.is_test AND p.unlinked_at IS NULL AND p.purpose IS DISTINCT FROM 'return'))`,
    [organizationId, candidates.flatMap((candidate) => candidate.orderIds), excludeIngestionId],
  );
  const labeledIds = new Set(labeled.rows.map((row) => Number(row.id)));
  for (const candidate of candidates) {
    candidate.orderIds.sort((a, b) => a - b);
    candidate.orderId = candidate.orderIds[0]!;
    candidate.labeled = candidate.orderIds.some((id) => labeledIds.has(id));
  }
  return candidates;
}

/**
 * The buyer-name rule (operator 2026-10-03):
 *   one open order for the buyer                      → that order
 *   several, some already labeled, some not           → the most recent unlabeled order
 *   several, none labeled (or all labeled)            → confirmation exception
 */
export function pickBuyerOrder(candidates: readonly BuyerOrderCandidate[]): { order: BuyerOrderCandidate; matchMethod: LabelMatchMethod } | { reason: LabelQuarantineReasonCode } {
  if (!candidates.length) return { reason: 'BUYER_NOT_FOUND' };
  if (candidates.length === 1) return { order: candidates[0]!, matchMethod: 'BUYER_NAME' };
  const unlabeled = candidates.filter((candidate) => !candidate.labeled);
  if (!unlabeled.length || unlabeled.length === candidates.length) return { reason: 'BUYER_AMBIGUOUS' };
  const [latest] = [...unlabeled].sort((a, b) => (b.orderedAt ?? '').localeCompare(a.orderedAt ?? '') || b.orderId - a.orderId);
  return { order: latest!, matchMethod: 'BUYER_NAME_NEXT_UNLABELED' };
}

/** Logical orders already carrying this tracking number (on their shipment, or on a live ShipStation shipment). */
async function ordersByTracking(client: Queryable, organizationId: OrgId, trackingNormalized: string): Promise<Array<{ id: number; account_source: string; order_id: string }>> {
  const rows = await client.query<{ id: number; account_source: string; order_id: string }>(
    `SELECT o.id, o.account_source, o.order_id FROM orders o
      WHERE o.organization_id = $1
        AND NULLIF(btrim(o.account_source), '') IS NOT NULL
        AND NULLIF(btrim(o.order_id), '') IS NOT NULL
        AND (o.shipment_id IN (SELECT s.id FROM shipping_tracking_numbers s
                                WHERE s.organization_id = $1 AND s.tracking_number_normalized = $2)
             OR o.id IN (SELECT r.order_row_id FROM shipstation_shipment_refs r
                          WHERE r.organization_id = $1 AND NOT r.voided AND NOT r.is_return_label
                            AND upper(regexp_replace(r.tracking_number, '[^A-Za-z0-9]', '', 'g')) = $2))
      ORDER BY o.id ASC`,
    [organizationId, trackingNormalized],
  );
  return rows.rows;
}

function matched(accountSource: string, orderRef: string, orderIds: number[], matchMethod: LabelMatchMethod, cycleforgeReference: string | null = null): LabelOrderResolution {
  return { exactOrder: { accountSource, marketplaceOrderId: orderRef, matchMethod, cycleforgeReference }, orderIds, quarantineReason: null };
}

/**
 * Label → ONE logical order, or a quarantine reason. The ladder, strongest
 * evidence first; every rung either names exactly one logical order or falls
 * through — nothing is guessed among several:
 *   1. an explicit CycleForge / marketplace reference printed with its account
 *   2. the tracking number already on one logical order
 *   3. the ship-to name, by the buyer-name rule (`pickBuyerOrder`)
 * Run it inside the transaction that records the outcome: the buyer rung
 * takes a per-buyer advisory lock, so two labels for one buyer pairing at
 * once cannot both claim the same "most recent unlabeled" order.
 */
export async function resolveExactLabelOrder(client: Queryable, organizationId: OrgId, evidence: ParsedLabelEvidence, ingestionId: number | null = null): Promise<LabelOrderResolution> {
  if (evidence.multiPackageEvidence) return { exactOrder: null, orderIds: [], quarantineReason: 'MULTI_PACKAGE_EVIDENCE' };
  if (!evidence.trackingNumberNormalized) return { exactOrder: null, orderIds: [], quarantineReason: 'TRACKING_ONLY' };
  if (!evidence.carrier) return { exactOrder: null, orderIds: [], quarantineReason: 'UNSUPPORTED_CARRIER' };

  let fallback: LabelQuarantineReasonCode = 'TRACKING_ONLY';
  const reference = evidence.cycleforgeReference ?? evidence.marketplaceOrderId;
  if (reference && evidence.accountSource) {
    const rows = await client.query<{ id: number | string }>(`SELECT id FROM orders WHERE organization_id = $1 AND account_source = $2 AND order_id = $3 ORDER BY id ASC`, [organizationId, evidence.accountSource, reference]);
    if (rows.rows.length) return matched(evidence.accountSource, reference, rows.rows.map((row) => Number(row.id)), evidence.cycleforgeReference ? 'CYCLEFORGE_REFERENCE' : 'MARKETPLACE_ORDER_ID', evidence.cycleforgeReference);
    fallback = 'ORDER_NOT_FOUND';
  } else if (reference) {
    fallback = evidence.cycleforgeReference ? 'CYCLEFORGE_REFERENCE_UNMAPPED' : 'MISSING_ACCOUNT_CONTEXT';
  }

  const tracked = await ordersByTracking(client, organizationId, evidence.trackingNumberNormalized);
  const trackedOrders = new Set(tracked.map((row) => `${row.account_source}\u0000${row.order_id}`));
  if (trackedOrders.size === 1) return matched(tracked[0]!.account_source, tracked[0]!.order_id, tracked.map((row) => Number(row.id)), 'TRACKING_NUMBER');
  if (trackedOrders.size > 1) return { exactOrder: null, orderIds: [], quarantineReason: 'AMBIGUOUS_ORDER_MATCH' };

  if (!evidence.shipToName) return { exactOrder: null, orderIds: [], quarantineReason: fallback };
  // Keyed like `sameBuyer`: first + last word, so `WILLIAM E KEELER` and `WILLIAM KEELER` queue on one lock.
  const words = normalizeBuyerName(evidence.shipToName).split(' ');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${organizationId}:label-buyer:${words[0]} ${words[words.length - 1]}`]);
  const pick = pickBuyerOrder(await findBuyerOrders(client, organizationId, evidence.shipToName, ingestionId));
  if ('reason' in pick) return { exactOrder: null, orderIds: [], quarantineReason: pick.reason };
  return matched(pick.order.accountSource, pick.order.orderRef, pick.order.orderIds, pick.matchMethod);
}
