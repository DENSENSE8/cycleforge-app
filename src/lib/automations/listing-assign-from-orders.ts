/**
 * Bulk listing→staff from to-ship selection: upsert automation_rules by
 * item_number and/or assign TEST+PACK on the selected orders now.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { normalizeItemNumber } from '@/lib/automations/listing-match';
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
  status: 'assigned' | 'rule_applied' | 'skipped' | 'failed';
  reason?: string;
};

export type ListingAssignResult = {
  mode: ListingAssignMode;
  orderResults: ListingAssignOrderResult[];
  rulesUpserted: number;
  listings: Array<{ itemNumber: string; orderCount: number }>;
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

async function upsertRuleForItemNumber(
  organizationId: OrgId,
  itemNumber: string,
  techId: number,
  packerId: number,
  actorStaffId: number | null,
): Promise<'created' | 'updated'> {
  const thenJson = [
    { type: 'assign_work', work_type: 'TEST', staff_id: techId },
    { type: 'assign_work', work_type: 'PACK', staff_id: packerId },
  ];
  const whenJson = { item_number: itemNumber };
  const name = `Listing ${itemNumber}`;

  const existing = await tenantQuery<{ id: number }>(
    organizationId,
    `SELECT id FROM automation_rules
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND NULLIF(trim(COALESCE(when_json->>'item_number', '')), '') IS NOT NULL
        AND upper(regexp_replace(trim(when_json->>'item_number'), '[^A-Za-z0-9]', '', 'g')) = $2
      LIMIT 1`,
    [organizationId, itemNumber],
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
 * Preview listings covered by a set of order ids (for the to-ship overlay).
 */
export async function previewListingAssign(
  organizationId: OrgId,
  orderIds: number[],
): Promise<{
  listings: Array<{ itemNumber: string; orderCount: number; orderIds: number[] }>;
  skippedNoItemNumber: number;
  totalOrders: number;
}> {
  const facts = await loadOrderFacts(organizationId, orderIds);
  const byItem = new Map<string, number[]>();
  let skippedNoItemNumber = 0;
  for (const row of facts) {
    const item = normalizeItemNumber(row.item_number);
    if (!item) {
      skippedNoItemNumber += 1;
      continue;
    }
    const list = byItem.get(item) ?? [];
    list.push(row.id);
    byItem.set(item, list);
  }
  return {
    totalOrders: facts.length,
    skippedNoItemNumber,
    listings: [...byItem.entries()].map(([itemNumber, ids]) => ({
      itemNumber,
      orderCount: ids.length,
      orderIds: ids,
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
        status: 'skipped',
        reason: 'order_not_found',
      });
    }
  }

  const byItem = new Map<string, OrderFact[]>();
  let skippedNoItemNumber = 0;
  for (const row of facts) {
    const item = normalizeItemNumber(row.item_number);
    if (!item) {
      skippedNoItemNumber += 1;
      orderResults.push({
        orderId: row.id,
        itemNumber: null,
        status: 'skipped',
        reason: 'no_item_number',
      });
      continue;
    }
    const list = byItem.get(item) ?? [];
    list.push(row);
    byItem.set(item, list);
  }

  const listings = [...byItem.entries()].map(([itemNumber, rows]) => ({
    itemNumber,
    orderCount: rows.length,
  }));

  let rulesUpserted = 0;

  if (input.mode === 'save_and_assign') {
    const techId = Number(input.techId);
    const packerId = Number(input.packerId);
    if (!Number.isFinite(techId) || techId <= 0 || !Number.isFinite(packerId) || packerId <= 0) {
      throw new Error('techId and packerId are required for save_and_assign');
    }

    for (const itemNumber of byItem.keys()) {
      await upsertRuleForItemNumber(
        orgId,
        itemNumber,
        techId,
        packerId,
        input.actorStaffId ?? null,
      );
      rulesUpserted += 1;
    }

    for (const [itemNumber, rows] of byItem) {
      for (const row of rows) {
        try {
          await upsertOrderAssignment(orgId, row.id, 'TEST', techId);
          await upsertOrderAssignment(orgId, row.id, 'PACK', packerId);
          orderResults.push({
            orderId: row.id,
            itemNumber,
            status: 'assigned',
          });
        } catch (err) {
          orderResults.push({
            orderId: row.id,
            itemNumber,
            status: 'failed',
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  } else {
    for (const [itemNumber, rows] of byItem) {
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
            status: result.status === 'applied' ? 'rule_applied' : 'skipped',
            reason: result.reason ?? result.error,
          });
        } catch (err) {
          orderResults.push({
            orderId: row.id,
            itemNumber,
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
    skippedNoItemNumber,
  };
}
