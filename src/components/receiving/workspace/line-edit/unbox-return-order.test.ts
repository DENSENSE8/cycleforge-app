import test from 'node:test';
import assert from 'node:assert/strict';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { buildReturnOrderModel, type ReturnOrderRow } from './unbox-return-order';

function order(fields: Partial<ShippedOrder>): ShippedOrder {
  return { id: 41, order_id: '112-3', packed_at: '2026-09-20T10:00:00Z', ...fields } as ShippedOrder;
}

const PO_ROW: ReturnOrderRow = {
  intake_type: 'PO',
  receiving_type: 'PO',
  carton_intake_type: 'PO',
  return_reason: 'Arrived damaged',
};

const RETURN_ROW: ReturnOrderRow = { ...PO_ROW, intake_type: 'RETURN', receiving_type: 'RETURN', carton_intake_type: 'RETURN' };

test('the stage reads the furthest the order got: delivered, then scanned out, then packed', () => {
  const delivered = buildReturnOrderModel(
    order({ ship_confirmed_at: '2026-09-25T12:00:00Z', delivered_at: '2026-09-29T12:00:00Z' }),
    PO_ROW,
  );
  assert.deepEqual([delivered.stage, delivered.stageAt], ['delivered', '2026-09-29T12:00:00Z']);
  const shipped = buildReturnOrderModel(order({ ship_confirmed_at: '2026-09-25T12:00:00Z' }), PO_ROW);
  assert.deepEqual([shipped.stage, shipped.stageAt], ['shipped', '2026-09-25T12:00:00Z']);
  const packed = buildReturnOrderModel(order({}), PO_ROW);
  assert.deepEqual([packed.stage, packed.stageAt], ['packed', '2026-09-20T10:00:00Z']);
});

test('the reason is read only off a carton filed as a return', () => {
  assert.equal(buildReturnOrderModel(order({}), PO_ROW).reason, null);
  assert.equal(buildReturnOrderModel(order({}), RETURN_ROW).reason?.label, 'Arrived damaged');
});
