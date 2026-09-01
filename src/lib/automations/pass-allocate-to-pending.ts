/**
 * After a QC PASS: match the unit's listing to a pending to-ship order.
 * Yes → allocate this unit + apply PACK assign from automation_rules.
 * No  → skip (unit stays TESTED).
 */

import { withTenantTransaction, tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { transition } from '@/lib/inventory/state-machine';
import { sqlOrderHasPackScan } from '@/lib/orders/order-grain-sql';
import {
  applyListingAssignment,
  loadOrderListingFacts,
} from '@/lib/automations/apply-listing-assignment';
import { normalizeItemNumber } from '@/lib/automations/listing-match';

export type PassAllocateResult = {
  matched: boolean;
  orderId: number | null;
  allocationId: number | null;
  packAssigned: boolean;
  reason?: string;
};

/**
 * Resolve marketplace item numbers that map to this unit's catalog / SKU.
 */
export async function resolveUnitItemNumbers(
  organizationId: OrgId,
  serialUnitId: number,
): Promise<string[]> {
  const r = await tenantQuery<{ item_number: string | null }>(
    organizationId,
    `SELECT DISTINCT spi.platform_item_id AS item_number
       FROM serial_units su
       LEFT JOIN sku_catalog sc
         ON sc.organization_id = su.organization_id
        AND (sc.id = su.sku_catalog_id OR (su.sku IS NOT NULL AND sc.sku = su.sku))
       LEFT JOIN sku_platform_ids spi
         ON spi.sku_catalog_id = sc.id
        AND spi.organization_id = su.organization_id
        AND spi.is_active = true
        AND spi.platform_item_id IS NOT NULL
        AND trim(spi.platform_item_id) <> ''
      WHERE su.id = $1 AND su.organization_id = $2`,
    [serialUnitId, organizationId],
  );
  const out = new Set<string>();
  for (const row of r.rows) {
    const n = normalizeItemNumber(row.item_number);
    if (n) out.add(n);
  }
  return [...out];
}

/**
 * Oldest unfilled pending to-ship order whose item_number matches (normalized).
 * Pending = not packed (order-grain) and not carrier-accepted/in-transit/delivered.
 */
export async function findPendingOrderByItemNumbers(
  organizationId: OrgId,
  itemNumbers: string[],
): Promise<{ id: number; item_number: string | null } | null> {
  if (itemNumbers.length === 0) return null;
  const packScan = sqlOrderHasPackScan('o');
  const r = await tenantQuery<{ id: number; item_number: string | null }>(
    organizationId,
    `SELECT o.id, o.item_number
       FROM orders o
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE o.organization_id = $1
        AND o.item_number IS NOT NULL
        AND trim(o.item_number) <> ''
        AND upper(regexp_replace(trim(o.item_number), '[^A-Za-z0-9]', '', 'g')) = ANY($2::text[])
        AND NOT ${packScan}
        AND NOT COALESCE(
              stn.is_carrier_accepted OR stn.is_in_transit
              OR stn.is_out_for_delivery OR stn.is_delivered,
              false
            )
        AND NOT EXISTS (
          SELECT 1 FROM order_unit_allocations oua
           WHERE oua.order_id = o.id
             AND oua.organization_id = o.organization_id
             AND oua.state IN ('ALLOCATED', 'PICKING', 'PICKED')
        )
      ORDER BY o.id ASC
      LIMIT 1`,
    [organizationId, itemNumbers],
  );
  return r.rows[0] ?? null;
}

/**
 * Allocate a specific TESTED (or GRADED) unit to a pending order and apply PACK rule.
 */
export async function passAllocateUnitToPendingOrder(input: {
  organizationId: OrgId;
  serialUnitId: number;
  actorStaffId?: number | null;
  clientEventId?: string | null;
}): Promise<PassAllocateResult> {
  const orgId = input.organizationId;
  const itemNumbers = await resolveUnitItemNumbers(orgId, input.serialUnitId);
  if (itemNumbers.length === 0) {
    return {
      matched: false,
      orderId: null,
      allocationId: null,
      packAssigned: false,
      reason: 'no_item_number_on_unit',
    };
  }

  const pending = await findPendingOrderByItemNumbers(orgId, itemNumbers);
  if (!pending) {
    // Still record a skip run via applyListingAssignment? Plan says write
    // automation_runs skipped with no_pending_order — do that explicitly.
    await withTenantTransaction(orgId, async (client) => {
      await client.query(
        `INSERT INTO automation_runs (
           organization_id, rule_id, trigger_key, entity_type, entity_id,
           status, matched_when, actions_applied, error, actor_staff_id
         ) VALUES ($1, NULL, 'unit.test_passed', 'serial_unit', $2,
                   'skipped', $3::jsonb, '[]'::jsonb, 'no_pending_order', $4)`,
        [
          orgId,
          input.serialUnitId,
          JSON.stringify({ item_numbers: itemNumbers }),
          input.actorStaffId ?? null,
        ],
      );
    });
    return {
      matched: false,
      orderId: null,
      allocationId: null,
      packAssigned: false,
      reason: 'no_pending_order',
    };
  }

  return withTenantTransaction(orgId, async (client) => {
    // Already allocated?
    const prior = await client.query<{ id: number; order_id: number }>(
      `SELECT id, order_id FROM order_unit_allocations
        WHERE serial_unit_id = $1 AND organization_id = $2
          AND state <> 'RELEASED'
        LIMIT 1`,
      [input.serialUnitId, orgId],
    );
    if (prior.rows[0]) {
      if (Number(prior.rows[0].order_id) === pending.id) {
        const facts = await loadOrderListingFacts(orgId, pending.id, client);
        const pack = facts
          ? await applyListingAssignment({
              organizationId: orgId,
              orderId: pending.id,
              triggerKey: 'unit.test_passed',
              facts,
              actorStaffId: input.actorStaffId,
              client,
            })
          : null;
        return {
          matched: true,
          orderId: pending.id,
          allocationId: Number(prior.rows[0].id),
          packAssigned: pack?.status === 'applied',
          reason: 'already_allocated',
        };
      }
      await client.query(
        `INSERT INTO automation_runs (
           organization_id, rule_id, trigger_key, entity_type, entity_id,
           status, matched_when, actions_applied, error, actor_staff_id
         ) VALUES ($1, NULL, 'unit.test_passed', 'serial_unit', $2,
                   'skipped', $3::jsonb, '[]'::jsonb, 'unit_already_allocated', $4)`,
        [
          orgId,
          input.serialUnitId,
          JSON.stringify({ pending_order_id: pending.id, prior_order_id: prior.rows[0].order_id }),
          input.actorStaffId ?? null,
        ],
      );
      return {
        matched: false,
        orderId: pending.id,
        allocationId: null,
        packAssigned: false,
        reason: 'unit_already_allocated',
      };
    }

    const allocQ = await client.query<{ id: number }>(
      `INSERT INTO order_unit_allocations
         (order_id, serial_unit_id, allocated_by_staff_id, state, organization_id)
       VALUES ($1, $2, $3, 'ALLOCATED', $4)
       RETURNING id`,
      [pending.id, input.serialUnitId, input.actorStaffId ?? null, orgId],
    );
    const allocationId = Number(allocQ.rows[0]?.id);
    if (!Number.isFinite(allocationId)) {
      throw new Error('allocation insert returned no id');
    }

    const t = await transition(
      {
        unitId: input.serialUnitId,
        to: 'ALLOCATED',
        eventType: 'ALLOCATED',
        actorStaffId: input.actorStaffId ?? null,
        station: 'SYSTEM',
        clientEventId: input.clientEventId
          ? `${input.clientEventId}:auto-alloc`
          : null,
        payload: {
          source: 'automation.pass_allocate',
          order_id: pending.id,
          allocation_id: allocationId,
        },
      },
      client,
      orgId,
    );

    if (!t.ok && t.from && t.from !== 'ALLOCATED') {
      await client.query(
        `UPDATE order_unit_allocations
            SET state = 'RELEASED', released_at = NOW(), released_reason = 'NOT_ALLOCATABLE'
          WHERE id = $1 AND organization_id = $2`,
        [allocationId, orgId],
      );
      await client.query(
        `INSERT INTO automation_runs (
           organization_id, rule_id, trigger_key, entity_type, entity_id,
           status, matched_when, actions_applied, error, actor_staff_id
         ) VALUES ($1, NULL, 'unit.test_passed', 'serial_unit', $2,
                   'failed', $3::jsonb, '[]'::jsonb, $4, $5)`,
        [
          orgId,
          input.serialUnitId,
          JSON.stringify({ pending_order_id: pending.id, from: t.from }),
          t.error ?? 'not_allocatable',
          input.actorStaffId ?? null,
        ],
      );
      return {
        matched: false,
        orderId: pending.id,
        allocationId: null,
        packAssigned: false,
        reason: `not_allocatable:${t.from}`,
      };
    }

    const facts = await loadOrderListingFacts(orgId, pending.id, client);
    const pack = facts
      ? await applyListingAssignment({
          organizationId: orgId,
          orderId: pending.id,
          triggerKey: 'unit.test_passed',
          facts,
          actorStaffId: input.actorStaffId,
          client,
        })
      : null;

    return {
      matched: true,
      orderId: pending.id,
      allocationId,
      packAssigned: pack?.status === 'applied',
      reason: pack?.reason,
    };
  });
}
