/**
 * Bulk listing→staff from to-ship selection: upsert automation_rules keyed on
 * the (item #, SKU) pair and/or assign TEST+PACK on the selected orders now.
 * A line with an item # but no SKU keys the item-#-only listing-wide wildcard.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { normalizeItemNumber, normalizeSku } from '@/lib/automations/listing-match';
import { LISTING_AUTOMATION_TRIGGER_KEYS } from '@/lib/schemas/automations';
import { upsertOrderAssignment } from '@/lib/work-assignments/upsert-order-assignment';
import { applyListingAssignment } from '@/lib/automations/apply-listing-assignment';

export type ListingAssignMode = 'save_and_assign' | 'apply_existing';

export type ListingAssignInput = {
  organizationId: OrgId;
  orderIds: number[];
  mode: ListingAssignMode;
  /** Required when mode is save_and_assign. */
  techId?: number | null;
  packerId?: number | null;
  actorStaffId?: number | null;
};

export type ListingAssignOrderResult = {
  orderId: number;
  itemNumber: string | null;
  sku: string | null;
  status: 'assigned' | 'rule_applied' | 'skipped' | 'failed';
  reason?: string;
};

/** One rule key: normalized item # + normalized SKU (null = item-#-only wildcard). */
export type ListingSkuPair = { itemNumber: string; sku: string | null };

export type ListingAssignResult = {
  mode: ListingAssignMode;
  orderResults: ListingAssignOrderResult[];
  rulesUpserted: number;
  listings: Array<ListingSkuPair & { orderCount: number }>;
  skippedNoItemNumber: number;
};

type OrderFact = {
  id: number;
  item_number: string | null;
  sku_catalog_id: number | null;
  sku: string | null;
  account_source: string | null;
};

async function loadOrderFacts(
  organizationId: OrgId,
  orderIds: number[],
): Promise<OrderFact[]> {
  if (orderIds.length === 0) return [];
  const r = await tenantQuery<OrderFact>(
    organizationId,
    `SELECT id, item_number, sku_catalog_id, sku, account_source
       FROM orders
      WHERE organization_id = $1 AND id = ANY($2::bigint[])`,
    [organizationId, orderIds],
  );
  return r.rows.map((row) => ({
    id: Number(row.id),
    item_number: row.item_number,
    sku_catalog_id: row.sku_catalog_id == null ? null : Number(row.sku_catalog_id),
    sku: row.sku,
    account_source: row.account_source,
  }));
}

/** Group order lines by (normalized item #, normalized SKU); lines without an item # are counted apart. */
function groupByPair(facts: OrderFact[]): {
  pairs: Array<ListingSkuPair & { rows: OrderFact[] }>;
  noItemNumber: OrderFact[];
} {
  const byKey = new Map<string, ListingSkuPair & { rows: OrderFact[] }>();
  const noItemNumber: OrderFact[] = [];
  for (const row of facts) {
    const itemNumber = normalizeItemNumber(row.item_number);
    if (!itemNumber) {
      noItemNumber.push(row);
      continue;
    }
    const sku = normalizeSku(row.sku) || null;
    const key = `${itemNumber}\u0000${sku ?? ''}`;
    const group = byKey.get(key) ?? { itemNumber, sku, rows: [] };
    group.rows.push(row);
    byKey.set(key, group);
  }
  return { pairs: [...byKey.values()], noItemNumber };
}

async function upsertRuleForPair(
  organizationId: OrgId,
  pair: ListingSkuPair,
  techId: number,
  packerId: number,
  actorStaffId: number | null,
): Promise<'created' | 'updated'> {
  const thenJson = [
    { type: 'assign_work', work_type: 'TEST', staff_id: techId },
    { type: 'assign_work', work_type: 'PACK', staff_id: packerId },
  ];
  const whenJson = pair.sku
    ? { item_number: pair.itemNumber, sku: pair.sku }
    : { item_number: pair.itemNumber };
  const name = pair.sku ? `Listing ${pair.itemNumber} · ${pair.sku}` : `Listing ${pair.itemNumber}`;

  // Same key expressions as ux_automation_rules_org_item_number_sku.
  const existing = await tenantQuery<{ id: number }>(
    organizationId,
    `SELECT id FROM automation_rules
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND NULLIF(trim(COALESCE(when_json->>'item_number', '')), '') IS NOT NULL
        AND upper(regexp_replace(trim(COALESCE(when_json->>'item_number', '')), '[^A-Za-z0-9]', '', 'g')) = $2
        AND upper(btrim(COALESCE(when_json->>'sku', ''))) = $3
      LIMIT 1`,
    [organizationId, pair.itemNumber, pair.sku ?? ''],
  );

  if (existing.rows[0]) {
    await tenantQuery(
      organizationId,
      `UPDATE automation_rules
          SET name = $3,
              enabled = true,
              trigger_keys = $4::text[],
              when_json = $5::jsonb,
              then_json = $6::jsonb,
              updated_by_staff_id = $7,
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [
        existing.rows[0].id,
        organizationId,
        name,
        [...LISTING_AUTOMATION_TRIGGER_KEYS],
        JSON.stringify(whenJson),
        JSON.stringify(thenJson),
        actorStaffId,
      ],
    );
    return 'updated';
  }

  await tenantQuery(
    organizationId,
    `INSERT INTO automation_rules (
       organization_id, name, enabled, priority, trigger_keys,
       when_json, then_json, created_by_staff_id, updated_by_staff_id
     ) VALUES (
       $1, $2, true, 100, $3::text[], $4::jsonb, $5::jsonb, $6, $6
     )`,
    [
      organizationId,
      name,
      [...LISTING_AUTOMATION_TRIGGER_KEYS],
      JSON.stringify(whenJson),
      JSON.stringify(thenJson),
      actorStaffId,
    ],
  );
  return 'created';
}

/**
 * Preview (item #, SKU) pairs covered by a set of order ids (for the to-ship overlay).
 */
export async function previewListingAssign(
  organizationId: OrgId,
  orderIds: number[],
): Promise<{
  listings: Array<ListingSkuPair & { orderCount: number; orderIds: number[] }>;
  skippedNoItemNumber: number;
  totalOrders: number;
}> {
  const facts = await loadOrderFacts(organizationId, orderIds);
  const { pairs, noItemNumber } = groupByPair(facts);
  return {
    totalOrders: facts.length,
    skippedNoItemNumber: noItemNumber.length,
    listings: pairs.map(({ itemNumber, sku, rows }) => ({
      itemNumber,
      sku,
      orderCount: rows.length,
      orderIds: rows.map((r) => r.id),
    })),
  };
}

export async function listingAssignFromOrders(
  input: ListingAssignInput,
): Promise<ListingAssignResult> {
  const orgId = input.organizationId;
  const orderIds = [...new Set(input.orderIds.filter((id) => Number.isFinite(id) && id > 0))];
  const facts = await loadOrderFacts(orgId, orderIds);
  const foundIds = new Set(facts.map((f) => f.id));

  const orderResults: ListingAssignOrderResult[] = [];
  for (const id of orderIds) {
    if (!foundIds.has(id)) {
      orderResults.push({
        orderId: id,
        itemNumber: null,
        sku: null,
        status: 'skipped',
        reason: 'order_not_found',
      });
    }
  }

  const { pairs, noItemNumber } = groupByPair(facts);
  for (const row of noItemNumber) {
    orderResults.push({
      orderId: row.id,
      itemNumber: null,
      sku: normalizeSku(row.sku) || null,
      status: 'skipped',
      reason: 'no_item_number',
    });
  }

  const listings = pairs.map(({ itemNumber, sku, rows }) => ({
    itemNumber,
    sku,
    orderCount: rows.length,
  }));

  let rulesUpserted = 0;

  if (input.mode === 'save_and_assign') {
    const techId = Number(input.techId);
    const packerId = Number(input.packerId);
    if (!Number.isFinite(techId) || techId <= 0 || !Number.isFinite(packerId) || packerId <= 0) {
      throw new Error('techId and packerId are required for save_and_assign');
    }

    for (const pair of pairs) {
      await upsertRuleForPair(orgId, pair, techId, packerId, input.actorStaffId ?? null);
      rulesUpserted += 1;
    }

    for (const { itemNumber, sku, rows } of pairs) {
      for (const row of rows) {
        try {
          await upsertOrderAssignment(orgId, row.id, 'TEST', techId);
          await upsertOrderAssignment(orgId, row.id, 'PACK', packerId);
          orderResults.push({ orderId: row.id, itemNumber, sku, status: 'assigned' });
        } catch (err) {
          orderResults.push({
            orderId: row.id,
            itemNumber,
            sku,
            status: 'failed',
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  } else {
    for (const { itemNumber, sku, rows } of pairs) {
      for (const row of rows) {
        try {
          const result = await applyListingAssignment({
            organizationId: orgId,
            orderId: row.id,
            triggerKey: 'order.item_number_set',
            facts: {
              item_number: itemNumber,
              sku_catalog_id: row.sku_catalog_id,
              sku: row.sku,
              account_source: row.account_source,
            },
            actorStaffId: input.actorStaffId,
          });
          orderResults.push({
            orderId: row.id,
            itemNumber,
            sku,
            status: result.status === 'applied' ? 'rule_applied' : 'skipped',
            reason: result.reason ?? result.error,
          });
        } catch (err) {
          orderResults.push({
            orderId: row.id,
            itemNumber,
            sku,
            status: 'failed',
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  return {
    mode: input.mode,
    orderResults,
    rulesUpserted,
    listings,
    skippedNoItemNumber: noItemNumber.length,
  };
}
