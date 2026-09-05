/**
 * Resolve whatever the operator pasted — a product title, an item number, a
 * marketplace order number, or a carrier tracking number — to ONE item number.
 *
 * The item number is the key every listing rule hangs off
 * (`automation_rules.when_json->>'item_number'`, see listing-match.ts), so an
 * operator who says "create a rule for this product" and pastes any of the
 * four handles must land on the same normalized key the rule engine matches
 * on. This module is that one funnel; nothing else guesses an item number
 * from text.
 *
 * Resolution order (first hit wins):
 *   1. item number — exact, separator-insensitive (`normalizeItemNumber`)
 *   2. marketplace order number — exact, separator-insensitive
 *   3. carrier tracking number — exact, via orders.shipment_id
 *   4. listing platform item id (ASIN / eBay item) on the catalog pairing
 *   5. product title — case-insensitive substring over orders; ONE distinct
 *      item number is a match, several is `ambiguous` with candidates
 *
 * Pure over an injected `query` (the assistant tool dep) so it is unit-testable
 * without a DB and so every statement leads with `organization_id = $1`.
 */

import { normalizeItemNumber } from '@/lib/automations/listing-match';
import { compactIdentifier } from '@/lib/search/order-number-match';
import type { OrgId } from '@/lib/tenancy/constants';

export type ItemReferenceMatchedBy =
  | 'item_number'
  | 'order_number'
  | 'tracking_number'
  | 'platform_item_id'
  | 'title';

export interface ItemReferenceCandidate {
  itemNumber: string;
  title: string | null;
  /** Orders in this org carrying the item number (0 for catalog-only hits). */
  orderCount: number;
}

export interface ItemReferenceMatch extends ItemReferenceCandidate {
  matchedBy: ItemReferenceMatchedBy;
  /** The order the reference pointed at, when it was an order/tracking handle. */
  orderId: number | null;
  orderNumber: string | null;
}

export type ItemReferenceResult =
  | { ok: true; match: ItemReferenceMatch; candidates: ItemReferenceCandidate[] }
  | { ok: false; reason: 'empty' | 'not_found' | 'ambiguous'; candidates: ItemReferenceCandidate[] };

export type ItemReferenceQuery = (
  orgId: OrgId,
  text: string,
  params?: ReadonlyArray<unknown>,
) => Promise<{ rows: Array<Record<string, unknown>> }>;

const TITLE_MIN_CHARS = 4;
const CANDIDATE_LIMIT = 6;

/** Separator-insensitive, upper-cased key — the same key the rule index uses. */
const SQL_NORMALIZED_ITEM = `upper(regexp_replace(trim(COALESCE(o.item_number, '')), '[^A-Za-z0-9]', '', 'g'))`;

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function countOrdersForItem(
  query: ItemReferenceQuery,
  orgId: OrgId,
  itemNumber: string,
): Promise<{ orderCount: number; title: string | null }> {
  const r = await query(
    orgId,
    `SELECT count(*)::int AS order_count, max(o.product_title) AS title
       FROM orders o
      WHERE o.organization_id = $1
        AND ${SQL_NORMALIZED_ITEM} = $2`,
    [orgId, itemNumber],
  );
  const row = r.rows[0] ?? {};
  return { orderCount: num(row.order_count), title: str(row.title) };
}

export async function resolveItemNumberReference(
  query: ItemReferenceQuery,
  orgId: OrgId,
  reference: string,
): Promise<ItemReferenceResult> {
  const raw = String(reference ?? '').trim();
  if (!raw) return { ok: false, reason: 'empty', candidates: [] };

  const compact = compactIdentifier(raw);
  const asItem = normalizeItemNumber(raw);
  const bareHandle = !/\s/.test(raw) && compact.length >= 4;

  if (bareHandle && asItem) {
    // 1. item number
    const byItem = await countOrdersForItem(query, orgId, asItem);
    if (byItem.orderCount > 0) {
      return {
        ok: true,
        match: {
          itemNumber: asItem,
          title: byItem.title,
          orderCount: byItem.orderCount,
          matchedBy: 'item_number',
          orderId: null,
          orderNumber: null,
        },
        candidates: [],
      };
    }

    // 2. marketplace order number
    const byOrder = await query(
      orgId,
      `SELECT o.id, o.order_id, o.item_number, o.product_title
         FROM orders o
        WHERE o.organization_id = $1
          AND lower(regexp_replace(COALESCE(o.order_id, ''), '[^A-Za-z0-9]', '', 'g')) = $2
          AND NULLIF(trim(COALESCE(o.item_number, '')), '') IS NOT NULL
        ORDER BY o.id DESC
        LIMIT 1`,
      [orgId, compact],
    );
    const orderHit = byOrder.rows[0];
    if (orderHit) {
      const itemNumber = normalizeItemNumber(str(orderHit.item_number) ?? '');
      const stats = await countOrdersForItem(query, orgId, itemNumber);
      return {
        ok: true,
        match: {
          itemNumber,
          title: str(orderHit.product_title) ?? stats.title,
          orderCount: stats.orderCount,
          matchedBy: 'order_number',
          orderId: num(orderHit.id),
          orderNumber: str(orderHit.order_id),
        },
        candidates: [],
      };
    }

    // 3. carrier tracking number → the order it ships
    const byTracking = await query(
      orgId,
      `SELECT o.id, o.order_id, o.item_number, o.product_title
         FROM orders o
         JOIN shipping_tracking_numbers t ON t.id = o.shipment_id
        WHERE o.organization_id = $1
          AND lower(regexp_replace(COALESCE(t.tracking_number, ''), '[^A-Za-z0-9]', '', 'g')) = $2
          AND NULLIF(trim(COALESCE(o.item_number, '')), '') IS NOT NULL
        ORDER BY o.id DESC
        LIMIT 1`,
      [orgId, compact],
    );
    const trackingHit = byTracking.rows[0];
    if (trackingHit) {
      const itemNumber = normalizeItemNumber(str(trackingHit.item_number) ?? '');
      const stats = await countOrdersForItem(query, orgId, itemNumber);
      return {
        ok: true,
        match: {
          itemNumber,
          title: str(trackingHit.product_title) ?? stats.title,
          orderCount: stats.orderCount,
          matchedBy: 'tracking_number',
          orderId: num(trackingHit.id),
          orderNumber: str(trackingHit.order_id),
        },
        candidates: [],
      };
    }

    // 4. listing platform item id on the catalog pairing (no orders yet)
    const byPlatform = await query(
      orgId,
      `SELECT p.platform_item_id, p.listing_title
         FROM sku_platform_ids p
         JOIN sku_catalog c ON c.id = p.sku_catalog_id
        WHERE c.organization_id = $1
          AND upper(regexp_replace(trim(COALESCE(p.platform_item_id, '')), '[^A-Za-z0-9]', '', 'g')) = $2
        ORDER BY p.is_active DESC, p.id DESC
        LIMIT 1`,
      [orgId, asItem],
    );
    const platformHit = byPlatform.rows[0];
    if (platformHit) {
      return {
        ok: true,
        match: {
          itemNumber: asItem,
          title: str(platformHit.listing_title),
          orderCount: 0,
          matchedBy: 'platform_item_id',
          orderId: null,
          orderNumber: null,
        },
        candidates: [],
      };
    }
  }

  // 5. product title — one distinct item number wins, several is ambiguous
  if (raw.length < TITLE_MIN_CHARS) return { ok: false, reason: 'not_found', candidates: [] };
  const byTitle = await query(
    orgId,
    `SELECT ${SQL_NORMALIZED_ITEM} AS item_number,
            max(o.product_title) AS title,
            count(*)::int AS order_count
       FROM orders o
      WHERE o.organization_id = $1
        AND NULLIF(trim(COALESCE(o.item_number, '')), '') IS NOT NULL
        AND o.product_title ILIKE '%' || $2 || '%'
      GROUP BY 1
      ORDER BY 3 DESC, 1 ASC
      LIMIT $3`,
    [orgId, raw, CANDIDATE_LIMIT],
  );
  const candidates: ItemReferenceCandidate[] = byTitle.rows
    .map((row) => ({
      itemNumber: normalizeItemNumber(str(row.item_number) ?? ''),
      title: str(row.title),
      orderCount: num(row.order_count),
    }))
    .filter((c) => c.itemNumber.length > 0);

  if (candidates.length === 1) {
    const only = candidates[0];
    return {
      ok: true,
      match: { ...only, matchedBy: 'title', orderId: null, orderNumber: null },
      candidates: [],
    };
  }
  if (candidates.length > 1) return { ok: false, reason: 'ambiguous', candidates };
  return { ok: false, reason: 'not_found', candidates: [] };
}
