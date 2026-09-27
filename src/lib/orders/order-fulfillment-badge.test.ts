/** Fulfillment badge vocabulary — our lifecycle → the Shopify/Ecwid word (research §4.2). */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { orderFulfillmentBadge, type OrderFulfillmentLine } from './order-fulfillment-badge';

const line = (facts: Partial<OrderFulfillmentLine> = {}): OrderFulfillmentLine => ({
  packed_at: null,
  test_date_time: null,
  ...facts,
});

const face = (lines: OrderFulfillmentLine[]) => {
  const badge = orderFulfillmentBadge(lines);
  return `${badge.label} · ${badge.tone} · ${badge.progress}`;
};

describe('orderFulfillmentBadge', () => {
  it('a line nobody has touched is Unfulfilled (attention)', () => {
    assert.equal(face([line()]), 'Unfulfilled · attention · incomplete');
  });

  it('picked or tested but not packed is In progress', () => {
    assert.equal(face([line({ picked_at: '2026-09-25T10:00:00Z' })]), 'In progress · info · partiallyComplete');
    assert.equal(face([line({ has_tech_scan: true })]), 'In progress · info · partiallyComplete');
  });

  it('every line packed is Packed; the pack-activity stamp counts', () => {
    assert.equal(
      face([line({ packed_at: '2026-09-25T10:00:00Z' }), line({ pack_activity_at: '2026-09-25T11:00:00Z' })]),
      'Packed · info · partiallyComplete',
    );
  });

  it('some lines packed reads Partially packed n/m, counting shipped lines as packed', () => {
    assert.equal(
      orderFulfillmentBadge([
        line({ packed_at: '2026-09-25T10:00:00Z' }),
        line({ ship_confirmed_at: '2026-09-25T12:00:00Z' }),
        line(),
      ]).label,
      'Partially packed 2/3',
    );
  });

  it('every line scanned out is Fulfilled', () => {
    assert.equal(
      face([line({ ship_confirmed_at: '2026-09-25T12:00:00Z' }), line({ is_shipped: true })]),
      'Fulfilled · success · complete',
    );
  });

  it('one short line holds the whole order, and outranks packed and held lines', () => {
    assert.equal(
      face([
        line({ packed_at: '2026-09-25T10:00:00Z' }),
        line({ row_flag: { flag: 'hold', by: null, at: null } }),
        line({ is_out_of_stock: true }),
      ]),
      'On hold · Out of stock · critical · incomplete',
    );
  });

  it('the Hold flag or an exception is On hold (warning), even over packed lines', () => {
    assert.equal(
      face([line({ packed_at: '2026-09-25T10:00:00Z', row_flag: { flag: 'hold', by: 'Ana', at: null } })]),
      'On hold · warning · incomplete',
    );
    assert.equal(face([line({ has_exception: true })]), 'On hold · warning · incomplete');
  });

  it('other row flags are tags, not fulfillment states', () => {
    assert.equal(orderFulfillmentBadge([line({ row_flag: { flag: 'priority', by: null, at: null } })]).key, 'unfulfilled');
  });

  it("the queue's `1` sentinel stamp is not a pack", () => {
    assert.equal(orderFulfillmentBadge([line({ packed_at: '1' })]).key, 'unfulfilled');
  });
});
