/**
 * `/incoming` mounts the RecordLedger — there is no Incoming column model or
 * slot table any more. What a consumer can still observe is pinned here: the
 * sort vocabulary the ledger header reads, and the comparator.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultDirForIncomingGridSort,
  incomingSortFactFor,
  isIncomingGridSortable,
} from '@/lib/receiving/receiving-grid-layout';
import { compareIncomingGridRows } from '@/lib/receiving/incoming-grid-compare';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

describe('isIncomingGridSortable — the one sortability answer', () => {
  it('keeps the fact words sortable and the chrome tracks not', () => {
    assert.equal(isIncomingGridSortable('title'), true);
    assert.equal(isIncomingGridSortable('status'), true);
    assert.equal(isIncomingGridSortable('tracking'), true);
    assert.equal(isIncomingGridSortable('select'), false);
    assert.equal(isIncomingGridSortable('age'), true);
  });

  it('maps each compound track to the fact word it orders by', () => {
    assert.equal(incomingSortFactFor('dates'), 'date');
    assert.equal(incomingSortFactFor('fulfillment'), 'order');
    assert.equal(incomingSortFactFor('item'), 'title');
    assert.equal(incomingSortFactFor('state'), 'status');
    assert.equal(incomingSortFactFor('thumb'), null);
  });
});

describe('incoming grid column sort', () => {
  it('defaults age to desc, everything else to asc', () => {
    assert.equal(defaultDirForIncomingGridSort('title'), 'asc');
    assert.equal(defaultDirForIncomingGridSort('age'), 'desc');
  });

  it('compareIncomingGridRows sorts titles A→Z', () => {
    const a = { id: 1, item_name: 'Alpha' } as ReceivingLineRow;
    const b = { id: 2, item_name: 'Bravo' } as ReceivingLineRow;
    assert.ok(compareIncomingGridRows(a, b, 'title', 'asc') < 0);
    assert.ok(compareIncomingGridRows(a, b, 'title', 'desc') > 0);
  });

  it('compareIncomingGridRows sorts status by delivery_state then confidence', () => {
    const stalled = {
      id: 1,
      delivery_state: 'STALLED',
      tracking_confidence: 'carrier_confirmed',
    } as ReceivingLineRow;
    const arriving = {
      id: 2,
      delivery_state: 'ARRIVING_TODAY',
      tracking_confidence: 'seller_reported',
    } as ReceivingLineRow;
    // ARRIVING_TODAY precedes STALLED in DELIVERY_STATE_ORDER.
    assert.ok(compareIncomingGridRows(arriving, stalled, 'status', 'asc') < 0);

    const seller = {
      id: 3,
      delivery_state: 'IN_TRANSIT',
      tracking_confidence: 'seller_reported',
    } as ReceivingLineRow;
    const carrier = {
      id: 4,
      delivery_state: 'IN_TRANSIT',
      tracking_confidence: 'carrier_confirmed',
    } as ReceivingLineRow;
    assert.ok(compareIncomingGridRows(seller, carrier, 'status', 'asc') < 0);
  });
});
