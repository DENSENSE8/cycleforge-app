import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { outboundSignals } from '@/lib/orders/outbound-signals';
import { ordersNextStep, type OrdersNextStepRecord } from '@/lib/orders/orders-next-step';
import { resolveOutboundStage } from '@/lib/order-lifecycle';

const NOW = Date.parse('2026-09-11T18:00:00.000Z');
const ELEVEN_DAYS_AGO = '2026-08-31T18:00:00.000Z';
const AN_HOUR_AGO = '2026-09-11T17:00:00.000Z';

/** The row from the Shipped desk: scanned out, carrier silent for 11 days. */
function stalledInTransit(over: Partial<OrdersNextStepRecord> = {}): OrdersNextStepRecord {
  return {
    shipment_id: 42,
    packed_at: '2026-09-08T18:00:00.000Z',
    ship_confirmed_at: '2026-08-28T18:00:00.000Z',
    is_out_of_stock: false,
    latest_status_category: 'IN_TRANSIT',
    latest_event_at: ELEVEN_DAYS_AGO,
    is_terminal: false,
    has_exception: false,
    ...over,
  } as OrdersNextStepRecord;
}

describe('outboundSignals', () => {
  it('computes stalled so no caller can forget it', () => {
    const bag = outboundSignals({
      packedAt: '2026-08-28T17:00:00.000Z',
      shipConfirmedAt: '2026-08-28T18:00:00.000Z',
      latestStatusCategory: 'IN_TRANSIT',
      latestEventAt: ELEVEN_DAYS_AGO,
      now: NOW,
    });
    assert.equal(bag.stalled, true);
    assert.equal(resolveOutboundStage(bag), 'EXCEPTION');
  });

  it('a live shipment scanned an hour ago is not stalled', () => {
    const bag = outboundSignals({
      packedAt: '2026-09-10T18:00:00.000Z',
      shipConfirmedAt: '2026-09-10T18:00:00.000Z',
      latestStatusCategory: 'IN_TRANSIT',
      latestEventAt: AN_HOUR_AGO,
      now: NOW,
    });
    assert.equal(bag.stalled, false);
    assert.equal(resolveOutboundStage(bag), 'IN_CUSTODY');
  });

  it('a delivered row is never stalled, however old the scan', () => {
    const bag = outboundSignals({
      shipConfirmedAt: '2026-07-01T18:00:00.000Z',
      latestStatusCategory: 'DELIVERED',
      latestEventAt: '2026-07-02T18:00:00.000Z',
      isTerminal: true,
      now: NOW,
    });
    assert.equal(bag.stalled, false);
    assert.equal(resolveOutboundStage(bag), 'DELIVERED');
  });
});

describe('ordersNextStep agrees with the status chip', () => {
  it('a stalled row reads Exception — never "→ Out for delivery"', () => {
    const next = ordersNextStep(stalledInTransit(), { now: NOW });
    assert.equal(next.label, 'Exception');
    assert.equal(next.blocked, true);
  });

  it('a carrier exception reads Exception', () => {
    const next = ordersNextStep(
      stalledInTransit({
        latest_status_category: 'EXCEPTION',
        latest_event_at: AN_HOUR_AGO,
        has_exception: true,
      }),
      { now: NOW },
    );
    assert.equal(next.label, 'Exception');
    assert.equal(next.blocked, true);
  });

  it('a moving row still advertises the next carrier word', () => {
    const next = ordersNextStep(stalledInTransit({ latest_event_at: AN_HOUR_AGO }), {
      now: NOW,
    });
    assert.equal(next.label, '→ Out for delivery');
    assert.equal(next.blocked, undefined);
  });

  it('out for delivery heads to Delivered', () => {
    const next = ordersNextStep(
      stalledInTransit({
        latest_status_category: 'OUT_FOR_DELIVERY',
        latest_event_at: AN_HOUR_AGO,
      }),
      { now: NOW },
    );
    assert.equal(next.label, '→ Delivered');
  });
});
