/**
 * The STATUS cell's second line — where an order is headed, and the terminal
 * marker once it has left. Pins the mapping, not the lifecycle rules: those
 * belong to `order-lifecycle.test.ts` and are read from there on purpose.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ordersNextStep, type OrdersNextStepRecord } from '@/lib/orders/orders-next-step';

function row(over: Partial<OrdersNextStepRecord> = {}): OrdersNextStepRecord {
  return {
    shipment_id: null,
    packed_at: null,
    ship_confirmed_at: null,
    is_out_of_stock: false,
    latest_status_category: null,
    is_terminal: null,
    has_exception: null,
    has_tech_scan: false,
    ...over,
  };
}

describe('ordersNextStep — pre-dock stations', () => {
  it('an unlabeled order is headed for Label', () => {
    assert.deepEqual(ordersNextStep(row()), {
      label: '→ Label',
      tip: 'Next: buy or attach a shipping label',
    });
  });

  it('a labeled order is headed for Pick — the desk verb, not the stage id', () => {
    assert.equal(ordersNextStep(row({ shipment_id: 42 })).label, '→ Pick');
  });

  it('a tested order is headed for Pack', () => {
    assert.equal(
      ordersNextStep(row({ shipment_id: 42, has_tech_scan: true })).label,
      '→ Pack',
    );
  });

  it('a packed order is headed for the dock', () => {
    assert.equal(
      ordersNextStep(row({ shipment_id: 42, has_tech_scan: true, packed_at: '2026-09-03T10:00:00Z' }))
        .label,
      '→ Scan out',
    );
  });

  it('a blocked order names the hold and carries the alert tone', () => {
    const next = ordersNextStep(row({ shipment_id: 42, is_out_of_stock: true }));
    assert.equal(next.label, '→ Clear hold');
    assert.equal(next.blocked, true);
    assert.equal(next.done, undefined);
  });
});

describe('ordersNextStep — carrier network after the dock', () => {
  it('dock scan with no carrier scan is headed for In Transit, not a blank line', () => {
    const next = ordersNextStep(
      row({ packed_at: '2026-09-03T10:00:00Z', ship_confirmed_at: '2026-09-03T18:00:00Z' }),
    );
    assert.equal(next.label, '→ In Transit');
    assert.equal(next.done, undefined);
  });

  it('process-gap still names the next carrier word — the gap is the pill', () => {
    const next = ordersNextStep(row({ ship_confirmed_at: '2026-09-03T18:00:00Z' }));
    assert.equal(next.label, '→ In Transit');
  });

  it('in-transit names Out for delivery next', () => {
    const next = ordersNextStep(row({ latest_status_category: 'IN_TRANSIT' }));
    assert.equal(next.label, '→ Out for delivery');
  });

  it('delivered outranks scanned out', () => {
    const next = ordersNextStep(
      row({
        packed_at: '2026-09-01T10:00:00Z',
        ship_confirmed_at: '2026-09-01T18:00:00Z',
        latest_status_category: 'DELIVERED',
      }),
    );
    assert.equal(next.label, 'Delivered');
    assert.equal(next.done, true);
  });

  it('a carrier exception is a hold, not a finish', () => {
    const next = ordersNextStep(
      row({
        packed_at: '2026-09-01T10:00:00Z',
        ship_confirmed_at: '2026-09-01T18:00:00Z',
        has_exception: true,
      }),
    );
    assert.equal(next.label, 'Exception');
    assert.equal(next.blocked, true);
    assert.equal(next.done, undefined);
  });

  it('a packed-but-unscanned order is NOT terminal — it still owes the dock', () => {
    assert.equal(
      ordersNextStep(row({ packed_at: '2026-09-03T10:00:00Z' })).label,
      '→ Scan out',
    );
  });
});
