/**
 * Dense To-ship compound view — identity line + flag mark on the item track.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ordersCompoundView,
  ordersEdgeMark,
  ordersIdentityLine,
  ordersItemStatus,
  ordersStateTone,
} from '@/lib/orders/orders-compound-view';
import { formatCompoundStageStepLine } from '@/components/tables/compound/compound-row-model';
import { resolveOrdersSlotValue } from '@/lib/tables/field-catalog/orders-resolve';
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
    assert.equal(ordersStateTone('Packed'), 'done');
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

describe('the pick step (absorbed into the slot resolver)', () => {
  // `ordersTestedStep` became `resolveOrdersSlotValue(row, 'orders.picked')`, and on 2026-09-14 the facts behind it moved off the…
  it('is empty when nobody has picked', () => {
    const step = resolveOrdersSlotValue(baseOrder(), 'orders.picked');
    assert.equal(step?.kind, 'stage_event');
    if (step?.kind !== 'stage_event') return;
    assert.equal(step.who, null);
    assert.equal(step.at, null);
    assert.equal(step.station, null);
    assert.equal(formatCompoundStageStepLine(step), null);
  });

  it('fills who and time when a pick scan exists; station stays null', () => {
    const step = resolveOrdersSlotValue(
      baseOrder({ picked_by_name: 'Alex', picked_at: '2026-08-20 18:00:00' }),
      'orders.picked',
    );
    if (step?.kind !== 'stage_event') return assert.fail('expected stage_event');
    assert.equal(step.who, 'Alex');
    assert.ok(step.at);
    assert.equal(step.station, null);
    const line = formatCompoundStageStepLine(step);
    assert.ok(line);
    assert.match(line!, /^Alex · /);
    assert.doesNotMatch(line!, / · $/);
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

  it('carries resolved SLOT values through to the view by track key', () => {
    const record = baseOrder({ picked_by_name: 'Alex', picked_at: '2026-08-20 18:00:00' });
    const picked = resolveOrdersSlotValue(record, 'orders.picked')!;
    const view = ordersCompoundView(record, {
      stateLabel: 'Tested',
      delayDays: 0,
      testerDisplay: 'Alex',
      packerDisplay: '---',
      slots: { 'status:1': picked },
    });
    const slot = view.slots?.['status:1'];
    assert.equal(slot?.kind, 'stage_event');
    if (slot?.kind !== 'stage_event') return;
    assert.equal(slot.who, 'Alex');
    assert.ok(slot.at);
  });

  it('bound subtitle parts REPLACE the implicit identity line — an org choice is final', () => {
    const view = ordersCompoundView(
      baseOrder({ pack_location_name: 'Staging A', pack_location_kind: 'STAGING' }),
      {
        stateLabel: 'Tested',
        delayDays: 0,
        testerDisplay: 'Alex',
        packerDisplay: '---',
        subtitleParts: [{ text: '3', toneClass: 'text-text-warning' }],
      },
    );
    assert.equal(view.note, null);
    assert.deepEqual(view.subtitleParts, [{ text: '3', toneClass: 'text-text-warning' }]);
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

  it('joins the listing URL onto the title from the item number', () => {
    const ebay = ordersCompoundView(baseOrder({ item_number: '123456789012' }), {
      stateLabel: null,
      delayDays: null,
    });
    assert.equal(ebay.titleHref, 'https://www.ebay.com/itm/123456789012');

    const blank = ordersCompoundView(baseOrder({ item_number: '' }), {
      stateLabel: null,
      delayDays: null,
    });
    assert.equal(blank.titleHref, null);
  });

  it('puts the civil ship-by on the delay, not a relative on-time face', () => {
    const view = ordersCompoundView(
      baseOrder({ deadline_at: '2026-08-17T12:00:00-07:00' }),
      { stateLabel: 'Awaiting test', delayDays: 0, todayKey: '2026-08-10' },
    );
    assert.equal(view.delay?.dateLabel, 'Aug 17');
    assert.equal(view.delay?.dateKey, '2026-08-17');
    assert.equal(view.delay?.overdue, false);
    assert.equal(view.delay?.dueToday, false);
    assert.match(String(view.delayTip ?? ''), /Ship by/);
  });

  it('marks due-today so the date is not faint on-time ink', () => {
    const view = ordersCompoundView(baseOrder({ deadline_at: '2026-08-17' }), {
      stateLabel: 'Awaiting test',
      delayDays: 0,
      todayKey: '2026-08-17',
    });
    assert.equal(view.delay?.dueToday, true);
    assert.equal(view.delay?.dateLabel, 'Aug 17');
  });

  it('keeps late days AND the civil date', () => {
    const view = ordersCompoundView(baseOrder({ deadline_at: '2026-08-14' }), {
      stateLabel: 'Awaiting test',
      delayDays: 15,
      todayKey: '2026-08-29',
    });
    assert.equal(view.delay?.dateLabel, 'Aug 14');
    assert.equal(view.delay?.overdue, true);
    assert.equal(view.delay?.days, 15);
  });

  it('does not invent a ship-by from created_at', () => {
    const view = ordersCompoundView(
      baseOrder({ deadline_at: null, ship_by_date: null, created_at: '2026-08-01T12:00:00-07:00' }),
      { stateLabel: 'Awaiting test', delayDays: null, todayKey: '2026-08-29' },
    );
    assert.equal(view.delay?.dateLabel, null);
    assert.equal(view.delay?.dateKey, null);
    assert.equal(view.delayTip, undefined);
  });
});

describe('ordersEdgeMark', () => {
  it('urgent is the order-level yellow rail, over any product flag', () => {
    assert.deepEqual(ordersEdgeMark({ is_urgent: true, is_out_of_stock: true, has_exception: true }), {
      label: 'Urgent',
      kind: 'urgent',
      barClass: 'bg-yellow-400',
      pulse: true,
      tickClass: 'bg-yellow-100',
    });
  });

  it('an exception pulses the same rail in red', () => {
    assert.deepEqual(
      ordersEdgeMark({ is_urgent: false, is_out_of_stock: true, has_exception: true }),
      { label: 'Exception', kind: 'attention', barClass: 'bg-rose-500', pulse: true, tickClass: 'bg-rose-100' },
    );
  });

  it('a shortage pulses the red rail too — operator 2026-09-15', () => {
    assert.deepEqual(
      ordersEdgeMark({ is_urgent: false, is_out_of_stock: true, has_exception: false }),
      { label: 'Out of stock', kind: 'attention', barClass: 'bg-rose-500', pulse: true, tickClass: 'bg-rose-100' },
    );
  });

  it('an ordinary row has no rail at all', () => {
    assert.equal(
      ordersEdgeMark({ is_urgent: false, is_out_of_stock: false, has_exception: false }),
      null,
    );
  });
});

describe('ordersItemStatus', () => {
  it('exception wins over out of stock on the item', () => {
    assert.equal(
      ordersItemStatus({ has_exception: true, is_out_of_stock: true })?.label,
      'Exception',
    );
  });

  it('out of stock is a product chip with a shortage card', () => {
    const status = ordersItemStatus({
      has_exception: false,
      is_out_of_stock: true,
      oos_sku: 'SKU',
      oos_kind: 'listing',
      product_title: 'Title',
      sku: 'SKU',
    });
    assert.equal(status?.label, 'Out of stock');
    assert.equal(status?.card?.sku, 'SKU');
  });
});
