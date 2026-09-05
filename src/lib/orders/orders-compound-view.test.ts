/**
 * Dense To-ship compound view — identity line + flag mark on the item track.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ordersCompoundView,
  ordersIdentityLine,
  ordersEdgeMark,
  ordersOrderedAt,
  ordersShipByDelay,
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
  it('marks tested / packed / carrier-in-network as done', () => {
    assert.equal(ordersStateTone('Tested'), 'done');
    assert.equal(ordersStateTone('Packed'), 'done');
    assert.equal(ordersStateTone('In Transit'), 'done');
    assert.equal(ordersStateTone('Pre-Transit'), 'done');
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

describe('the tested step (absorbed into the slot resolver)', () => {
  // `ordersTestedStep` became `resolveOrdersSlotValue(row, 'orders.picked')` —
  // same facts, resolved by binding rather than by a hard-coded step. The
  // resolver's own suite lives beside the catalog; these two pin the seam this
  // file always pinned: the step line the compound cell paints.
  it('is empty when nobody has tested', () => {
    const step = resolveOrdersSlotValue(baseOrder(), 'orders.picked', { testerDisplay: '---' });
    assert.equal(step?.kind, 'stage_event');
    if (step?.kind !== 'stage_event') return;
    assert.equal(step.who, null);
    assert.equal(step.at, null);
    assert.equal(step.station, null);
    assert.equal(formatCompoundStageStepLine(step), null);
  });

  it('fills who and time when a tech scan exists; station stays null until stamped', () => {
    const step = resolveOrdersSlotValue(
      baseOrder({ test_date_time: '2026-08-20T18:00:00.000Z' }),
      'orders.picked',
      { testerDisplay: 'Alex' },
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
    const record = baseOrder({ test_date_time: '2026-08-20T18:00:00.000Z' });
    const tested = resolveOrdersSlotValue(record, 'orders.picked', { testerDisplay: 'Alex' })!;
    const view = ordersCompoundView(record, {
      stateLabel: 'Tested',
      delayDays: 0,
      testerDisplay: 'Alex',
      packerDisplay: '---',
      slots: { 'status:1': tested },
    });
    const slot = view.slots?.['status:1'];
    assert.equal(slot?.kind, 'stage_event');
    if (slot?.kind !== 'stage_event') return;
    assert.equal(slot.who, 'Alex');
    assert.ok(slot.at);
    assert.equal(slot.station, null);
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

  it('does not dual-write sale_amount onto view.amount — money is a subtitle', () => {
    const view = ordersCompoundView(baseOrder(), { stateLabel: 'Awaiting test' });
    assert.equal(view.amount, null);
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

describe('ordersOrderedAt — the DATES top line', () => {
  it('prefers the channel order date and names it in the tooltip', () => {
    const face = ordersOrderedAt(
      baseOrder({ order_date: '2026-08-20T18:00:00.000Z', created_at: '2026-08-25T09:00:00.000Z' }),
    );
    assert.ok(face);
    assert.match(face!.tip, /^Ordered · /);
    // The PURCHASE day, not the import day.
    assert.match(face!.tip, /Aug 20/);
  });

  it('falls back to the import stamp when the channel sent no order date', () => {
    const face = ordersOrderedAt(baseOrder({ order_date: null, created_at: '2026-08-25T09:00:00.000Z' }));
    assert.ok(face);
    assert.match(face!.label, /Aug 25/);
    // Staff must be able to tell a purchase date from an import date.
    assert.match(face!.tip, /^Imported · /);
    assert.match(face!.tip, /no order date came from the channel/);
  });

  it('treats the legacy sentinel as absent, not as a date', () => {
    const face = ordersOrderedAt(baseOrder({ order_date: '1', created_at: '2026-08-25T09:00:00.000Z' }));
    assert.ok(face);
    assert.match(face!.tip, /^Imported · /);
  });

  it('is null only when there is no date at all', () => {
    assert.equal(ordersOrderedAt(baseOrder({ order_date: null, created_at: null })), null);
  });
});

describe('ordersShipByDelay — the facts the age face reads', () => {
  it('counts the days remaining on a future deadline (lateness clamps at 0)', () => {
    const delay = ordersShipByDelay(
      { deadline_at: '2026-09-20T00:00:00-07:00', ship_by_date: null },
      0,
      '2026-09-04',
    );
    assert.equal(delay.days, 0);
    assert.equal(delay.overdue, false);
    assert.equal(delay.daysUntil, 16);
  });

  it('has no countdown once the deadline has passed', () => {
    const delay = ordersShipByDelay(
      { deadline_at: '2026-09-02T00:00:00-07:00', ship_by_date: null },
      2,
      '2026-09-04',
    );
    assert.equal(delay.overdue, true);
    assert.equal(delay.daysUntil, null);
  });

  it('marks due-today without a countdown', () => {
    const delay = ordersShipByDelay(
      { deadline_at: '2026-09-04T00:00:00-07:00', ship_by_date: null },
      0,
      '2026-09-04',
    );
    assert.equal(delay.dueToday, true);
    assert.equal(delay.daysUntil, null);
  });
});

describe('ordersOrderedAt — the key the in-cell calendar commits against', () => {
  it('carries the purchase day as the picker seed', () => {
    const face = ordersOrderedAt(baseOrder({ order_date: '2026-08-20T18:00:00.000Z' }));
    assert.equal(face?.dateKey, '2026-08-20');
  });

  it('seeds from the import stamp when that is all there is', () => {
    const face = ordersOrderedAt(baseOrder({ order_date: null, created_at: '2026-08-25T09:00:00.000Z' }));
    assert.equal(face?.dateKey, '2026-08-25');
  });
});

describe('ordersEdgeMark — the leading rail', () => {
  it('paints nothing on an ordinary row', () => {
    assert.equal(ordersEdgeMark(baseOrder()), null);
  });

  it('urgent claims the rail — it has no other carrier and it moved the queue', () => {
    assert.deepEqual(ordersEdgeMark(baseOrder({ is_urgent: true })), {
      label: 'Urgent',
      barClass: 'bg-violet-500',
    });
  });

  it('blocked claims it only when the row is not urgent', () => {
    assert.equal(ordersEdgeMark(baseOrder({ is_out_of_stock: true }))?.label, 'Out of stock');
    // Urgent wins: the leftmost mark is never spent on the weaker signal, and
    // BLOCKED already has the state pill.
    assert.equal(
      ordersEdgeMark(baseOrder({ is_out_of_stock: true, is_urgent: true }))?.label,
      'Urgent',
    );
  });

  it('carries a WORD, not just a hue — colour never holds the meaning alone', () => {
    const mark = ordersEdgeMark(baseOrder({ is_urgent: true }));
    assert.ok(mark?.label);
  });
});
