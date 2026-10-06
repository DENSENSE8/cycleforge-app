import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  fulfillmentCurrentStatus,
  hasExternalFulfillmentHandoff,
  type FulfillmentSummaryLine,
} from './order-fulfillment-summary';

function line(overrides: Partial<FulfillmentSummaryLine> = {}): FulfillmentSummaryLine {
  return {
    is_out_of_stock: false,
    has_exception: false,
    row_flag: null,
    ship_confirmed_at: null,
    is_shipped: false,
    packed_at: null,
    pack_activity_at: null,
    picked_at: null,
    test_date_time: null,
    has_pick_scan: false,
    is_delivered: false,
    latest_event_at: null,
    latest_status_category: null,
    latest_status_description: null,
    latest_status_label: null,
    ...overrides,
  };
}

describe('fulfillment summary', () => {
  test('does not reveal external fulfillment for a label-only order', () => {
    const lines = [line({ latest_status_category: 'LABEL_CREATED', latest_status_label: 'Label created' })];
    assert.equal(hasExternalFulfillmentHandoff(lines), false);
    assert.deepEqual(fulfillmentCurrentStatus(lines), { label: 'Unfulfilled' });
  });

  test('opens external after dock handoff while awaiting the first carrier scan', () => {
    const lines = [line({ ship_confirmed_at: '2026-09-29T08:00:00.000Z' })];
    assert.equal(hasExternalFulfillmentHandoff(lines), true);
    assert.deepEqual(fulfillmentCurrentStatus(lines), { label: 'Awaiting carrier scan' });
  });

  test('a buyer cancel replaces Fulfilled on the record', () => {
    assert.deepEqual(
      fulfillmentCurrentStatus([
        line({
          status: 'buyer_cancelled',
          is_shipped: true,
          is_delivered: true,
          latest_status_label: 'Delivered',
        }),
      ]),
      { label: 'Buyer cancel' },
    );
  });

  test('carrier truth becomes the current status and delivered always wins', () => {
    const inTransit = line({
      is_shipped: true,
      latest_event_at: '2026-09-29T09:00:00.000Z',
      latest_status_category: 'IN_TRANSIT',
      latest_status_label: 'On the way',
    });
    assert.equal(fulfillmentCurrentStatus([inTransit]).label, 'On the way');

    assert.deepEqual(
      fulfillmentCurrentStatus([
        inTransit,
        line({
          is_shipped: true,
          is_delivered: true,
          latest_event_at: '2026-09-29T10:00:00.000Z',
          latest_status_category: 'DELIVERED',
        }),
      ]),
      { label: 'Delivered', detail: undefined },
    );
  });
});
