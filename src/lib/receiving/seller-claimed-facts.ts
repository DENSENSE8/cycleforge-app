/**
 * Load seller-claimed listing facts for Testing QC.
 *
 * Prefer matched outbound / return order sold-as (`orders.condition`), then
 * `platform_listings.listing_condition`. Never invent from warehouse
 * `condition_grade` — that is our grade, not the marketplace claim.
 *
 * Pure DB reads; callers pass whatever keys their surface already holds.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import {
  findShippedOrderByTsnSerial,
  findShippedOrderForSerialUnit,
} from '@/lib/neon/serial-units-queries';

type SellerClaimedFactsInput = {
  serialUnitId?: number | null;
  serialNumber?: string | null;
  skuCatalogId?: number | null;
  /** Return-linked order # (`source_order_id` / PO face on RETURN cartons). */
  orderIdHint?: string | null;
};

type SellerClaimedFacts = {
  matchedOrderCondition: string | null;
  listingCondition: string | null;
};

function nonempty(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  return s || null;
}

async function conditionFromOrderId(
  orgId: OrgId,
  orderId: string,
): Promise<string | null> {
  const r = await tenantQuery<{ condition: string | null }>(
    orgId,
    `SELECT o.condition
       FROM orders o
      WHERE o.organization_id = $1
        AND o.order_id = $2
      ORDER BY o.id DESC
      LIMIT 1`,
    [orgId, orderId],
  );
  return nonempty(r.rows[0]?.condition);
}

async function listingConditionForSku(
  orgId: OrgId,
  skuCatalogId: number,
): Promise<string | null> {
  const r = await tenantQuery<{ listing_condition: string | null }>(
    orgId,
    `SELECT pl.listing_condition
       FROM platform_listings pl
      WHERE pl.organization_id = $1
        AND pl.sku_catalog_id = $2
        AND pl.listing_condition IS NOT NULL
        AND btrim(pl.listing_condition) <> ''
      ORDER BY pl.updated_at DESC NULLS LAST, pl.id DESC
      LIMIT 1`,
    [orgId, skuCatalogId],
  );
  return nonempty(r.rows[0]?.listing_condition);
}

/**
 * Resolve sold-as + listing-condition facts for {@link resolveSellerClaimedCondition}.
 */
export async function loadSellerClaimedFacts(
  orgId: OrgId,
  input: SellerClaimedFactsInput,
): Promise<SellerClaimedFacts> {
  let matchedOrderCondition: string | null = null;

  const serialUnitId =
    typeof input.serialUnitId === 'number' &&
    Number.isFinite(input.serialUnitId) &&
    input.serialUnitId > 0
      ? input.serialUnitId
      : null;

  if (serialUnitId != null) {
    const matched = await findShippedOrderForSerialUnit(serialUnitId, {
      organizationId: orgId,
    }, orgId);
    matchedOrderCondition = nonempty(matched?.condition);
  }

  if (!matchedOrderCondition) {
    const serial = nonempty(input.serialNumber);
    if (serial) {
      const matched = await findShippedOrderByTsnSerial(serial, {
        organizationId: orgId,
      }, orgId);
      matchedOrderCondition = nonempty(matched?.condition);
    }
  }

  if (!matchedOrderCondition) {
    const hint = nonempty(input.orderIdHint);
    if (hint) {
      matchedOrderCondition = await conditionFromOrderId(orgId, hint);
    }
  }

  let listingCondition: string | null = null;
  const skuCatalogId =
    typeof input.skuCatalogId === 'number' &&
    Number.isFinite(input.skuCatalogId) &&
    input.skuCatalogId > 0
      ? input.skuCatalogId
      : null;
  if (skuCatalogId != null) {
    listingCondition = await listingConditionForSku(orgId, skuCatalogId);
  }

  return { matchedOrderCondition, listingCondition };
}
