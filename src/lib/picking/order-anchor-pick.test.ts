/**
 * The pick anchors on the ORDER, not the label: a walk-in / Pickup order has
 * no shipment and no tracking, so the desk anchor (`POST /api/picking/desk/scan`
 * `{ type: 'ORDER', orderId }`) binds only through SAL `metadata.order_row_id`.
 * Runs against the real database inside one rolled-back transaction.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTenantConnection } from '@/lib/tenancy/db';
import { createStationActivityLog } from '@/lib/station-activity';
import { refreshOrderStageFacts } from '@/lib/orders/order-stage-facts';
import { findOrderById } from '@/lib/tech/order-card';
import {
  insertTechSerialForSalContext,
  resolveTechSerialSalContext,
} from '@/lib/tech/insertTechSerialForSalContext';

const ORG = '00000000-0000-0000-0000-000000000001';
const hasDatabase = Boolean(process.env.DATABASE_URL);

class Rollback extends Error {}

test('a no-tracking Pickup order anchored by id reads picked, and the next serial lands on it', { skip: !hasDatabase && 'no DATABASE_URL' }, async () => {
  const tag = `CF-TEST-ANCHOR-${Date.now()}`;
  await withTenantConnection(ORG, async (client) => {
    const staffId = Number((await client.query(`SELECT id FROM staff WHERE organization_id = $1 ORDER BY id LIMIT 1`, [ORG])).rows[0].id);
    const orderId = Number((await client.query(
      `INSERT INTO orders (organization_id, order_id, product_title, sku, quantity, status, fulfillment_channel, shipment_id, created_at)
       VALUES ($1::uuid, $2, 'CF-TEST pickup', $2, '1', 'unassigned', 'PICKUP', NULL, NOW()) RETURNING id`,
      [ORG, tag],
    )).rows[0].id);

    const order = await findOrderById(client, orderId, ORG);
    assert.equal(Number(order.id), orderId);
    assert.equal(order.shipping_tracking_number, '', 'a Pickup order carries no tracking');

    // The route's anchor row for an order-anchored pick.
    const salId = await createStationActivityLog(client, {
      organizationId: ORG,
      station: 'PICK',
      activityType: 'PICK_SCANNED',
      staffId,
      shipmentId: null,
      scanRef: tag,
      metadata: { source: 'picking.desk.scan', order_found: true, anchor: 'ORDER', order_id: tag, order_row_id: orderId, tracking: null },
    });
    assert.ok(salId);
    await refreshOrderStageFacts(ORG, { orderIds: [orderId] }, client);
    const facts = (await client.query(
      `SELECT has_pick_scan, picked_by FROM order_stage_facts WHERE organization_id = $1 AND order_id = $2`,
      [ORG, orderId],
    )).rows[0];
    assert.equal(facts?.has_pick_scan, true);
    assert.equal(Number(facts?.picked_by), staffId);

    // The serial scanned next resolves its order from the anchor, not a shipment.
    const ctx = await resolveTechSerialSalContext(client, salId!, ORG);
    assert.ok(ctx.ok);
    assert.equal(ctx.ctx.orderId, orderId);
    const ins = await insertTechSerialForSalContext(client, { organizationId: ORG, salContext: ctx.ctx, staffId, serial: `${tag}-SN` });
    assert.ok(ins.ok);
    const tsn = (await client.query(`SELECT order_id FROM tech_serial_numbers WHERE id = $1`, [ins.techSerialId])).rows[0];
    assert.equal(Number(tsn.order_id), orderId);

    throw new Rollback();
  }).catch((err) => {
    if (!(err instanceof Rollback)) throw err;
  });
});
