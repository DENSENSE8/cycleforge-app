/**
 * Dense To-ship compound view — identity line + flag mark on the item track.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ordersCompoundView,
  ordersIdentityLine,
  ordersStateTone,
} from '@/lib/orders/orders-compound-view';
import type { ShippedOrder } from '@/types/orders';

function baseOrder(over: Partial<ShippedOrder> = {}): ShippedOrder {
  return {
    id: 1,
    order_id: '111-2222222-3333333',
    product_title: 'Widget',
    sale_amount: '49.99',
    notes: null,
    shipping_tracking_number: null,
    ...over,
  } as ShippedOrder;
}

describe('ordersStateTone', () => {
  it('alerts on blocked / hold vocabulary', () => {
    assert.equal(ordersStateTone('Out of stock'), 'alert');
    assert.equal(ordersStateTone('Hold'), 'alert');
  });
  it('marks tested / packed / ready as done', () => {
    assert.equal(ordersStateTone('Tested'), 'done');
    assert.equal(ordersStateTone('Packed · Staged'), 'done');
  });
  it('keeps ordinary queue states neutral', () => {
    assert.equal(ordersStateTone('Awaiting test'), 'neutral');
    assert.equal(ordersStateTone(null), 'neutral');
  });
});

describe('ordersIdentityLine', () => {
  it('returns null when tester/packer/station are all empty', () => {
    assert.equal(ordersIdentityLine(baseOrder(), { testerDisplay: '---', packerDisplay: '---' }), null);
  });

  it('joins tester stamp, station, and packer without fabricating blanks', () => {
    const line = ordersIdentityLine(
      baseOrder({
        test_date_time: '2026-08-20T18:00:00.000Z',
        pack_location_name: 'Pack Desk 2',
        pack_location_kind: 'DESK',
        packed_at: '2026-08-21T16:00:00.000Z',
      }),
      { testerDisplay: 'Alex', packerDisplay: 'Sam' },
    );
    assert.ok(line);
    assert.match(line!, /Alex/);
    assert.match(line!, /Pack Desk 2|Desk 2/);
    assert.match(line!, /Pack Sam/);
  });
});

describe('ordersCompoundView', () => {
  it('puts identity on the note line when there is no operator note', () => {
    const view = ordersCompoundView(
      baseOrder({
        pack_location_name: 'Staging A',
        pack_location_kind: 'STAGING',
      }),
      {
        stateLabel: 'Tested',
        delayDays: 0,
        testerDisplay: 'Alex',
        packerDisplay: '---',
      },
    );
    assert.ok(view.note);
    assert.match(view.note!, /Alex/);
    assert.match(view.note!, /Staging A/);
    assert.equal(view.flagMark, null);
  });

  it('keeps the operator note on the secondary and parks identity in the state tip', () => {
    const view = ordersCompoundView(
      baseOrder({
        notes: 'Customer called',
        pack_location_name: 'Bench 1',
        pack_location_kind: 'DESK',
      }),
      {
        stateLabel: 'Awaiting test',
        delayDays: 1,
        delayTip: '1 day late',
        testerDisplay: '---',
        packerDisplay: '---',
      },
    );
    assert.equal(view.note, 'Customer called');
    assert.ok(view.stateTip);
    assert.match(view.stateTip!, /1 day late/);
    assert.match(view.stateTip!, /Bench 1/);
  });

  it('carries the triage flag mark for the compound title track', () => {
    const view = ordersCompoundView(baseOrder(), {
      stateLabel: 'Awaiting test',
      delayDays: null,
      flagMark: {
        label: 'Hold',
        tip: 'Hold — Do not pick',
        dotClass: 'bg-amber-500',
      },
    });
    assert.equal(view.flagMark?.label, 'Hold');
    assert.equal(view.flagMark?.dotClass, 'bg-amber-500');
  });
});
