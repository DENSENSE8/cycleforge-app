/**
 * Per-day import records — the day arithmetic and the grid shaping.
 *
 * DB-free by construction: the pure half is a separate module from the
 * `tenantQuery` read for exactly this reason (same split as
 * `auto-cage-core` / `auto-cage`). What is defended here is the behaviour an
 * operator can see — the arrows never walk into tomorrow, a backwards calendar
 * drag still means a range, and a day's rows band under the day they landed on.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  groupImportedOrdersByDay,
  importDayRangeForOffset,
  importDayRangeLength,
  importSourceTally,
  importedOrderToQueueRow,
  normalizeImportDayRange,
  type ImportedOrderRecord,
} from '@/lib/orders/import-history-core';

const TODAY = '2026-09-03';

function record(overrides: Partial<ImportedOrderRecord> = {}): ImportedOrderRecord {
  return {
    id: 1,
    orderNumber: '03-15100-78271',
    productTitle: 'Shimano Ultegra R8000',
    sku: 'SHI-R8000',
    itemNumber: '1155501',
    condition: 'used',
    quantity: '1',
    trackingNumber: '9400111899223197428490',
    accountSource: 'google-sheets-transfer-orders',
    createdAt: '2026-09-03T17:30:00.000Z',
    importDayKey: TODAY,
    ...overrides,
  };
}

describe('stepping days', () => {
  it('offset 0 is today, as a single day', () => {
    assert.deepEqual(importDayRangeForOffset(0, TODAY), { from: TODAY, to: TODAY });
  });

  it('walks backwards a day at a time, across a month boundary', () => {
    assert.deepEqual(importDayRangeForOffset(3, TODAY), {
      from: '2026-08-31',
      to: '2026-08-31',
    });
  });

  it('never walks into tomorrow — a negative offset clamps at today', () => {
    // The arrows disable forward travel at today; this is the same clamp in the
    // math, so a hand-edited `?importDay=-4` cannot ask for the future either.
    assert.deepEqual(importDayRangeForOffset(-4, TODAY), { from: TODAY, to: TODAY });
  });

  it('a garbage anchor falls back to today rather than emitting an empty range', () => {
    const range = importDayRangeForOffset(0, 'not-a-date');
    assert.match(range.from, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(range.from, range.to);
  });
});

describe('the calendar range', () => {
  it('takes an ordered pick as-is', () => {
    assert.deepEqual(
      normalizeImportDayRange({ from: '2026-09-01', to: '2026-09-03' }, TODAY),
      { from: '2026-09-01', to: '2026-09-03' },
    );
  });

  it('orders a backwards drag instead of returning an impossible window', () => {
    assert.deepEqual(
      normalizeImportDayRange({ from: '2026-09-03', to: '2026-09-01' }, TODAY),
      { from: '2026-09-01', to: '2026-09-03' },
    );
  });

  it('one end picked is ONE day, never "everything since"', () => {
    // A single calendar click hands back `{ from }` with no `to`. Reading that
    // as an open-ended range is how one click becomes a full-table scan.
    assert.deepEqual(normalizeImportDayRange({ from: '2026-08-20' }, TODAY), {
      from: '2026-08-20',
      to: '2026-08-20',
    });
  });

  it('clamps a future end back to today', () => {
    assert.deepEqual(
      normalizeImportDayRange({ from: '2026-09-01', to: '2026-12-25' }, TODAY),
      { from: '2026-09-01', to: TODAY },
    );
  });

  it('no pick at all is null — the caller falls back to the day offset', () => {
    assert.equal(normalizeImportDayRange({}, TODAY), null);
    assert.equal(normalizeImportDayRange({ from: 'nope', to: '' }, TODAY), null);
  });

  it('counts days inclusively', () => {
    assert.equal(importDayRangeLength({ from: TODAY, to: TODAY }), 1);
    assert.equal(importDayRangeLength({ from: '2026-09-01', to: '2026-09-03' }), 3);
    assert.equal(importDayRangeLength({ from: '', to: '' }), 0);
  });
});

describe('banding the rows', () => {
  it('newest day first, newest row first inside a day', () => {
    const days = groupImportedOrdersByDay([
      record({ id: 5, importDayKey: '2026-09-02' }),
      record({ id: 9, importDayKey: TODAY }),
      record({ id: 7, importDayKey: '2026-09-02' }),
      record({ id: 11, importDayKey: TODAY }),
    ]);
    assert.deepEqual(days.map(([day]) => day), [TODAY, '2026-09-02']);
    assert.deepEqual(days[0][1].map((r) => r.id), [11, 9]);
    assert.deepEqual(days[1][1].map((r) => r.id), [7, 5]);
  });

  it('drops a row with no day rather than inventing a band for it', () => {
    const days = groupImportedOrdersByDay([
      record({ id: 1, importDayKey: '' }),
      record({ id: 2, importDayKey: TODAY }),
    ]);
    assert.deepEqual(days.map(([day]) => day), [TODAY]);
    assert.deepEqual(days[0][1].map((r) => r.id), [2]);
  });

  it('synthesizes no empty band for a day nothing landed on', () => {
    // An empty band would claim "we looked and there were zero" in a list whose
    // other bands mean "here is what happened". The surface says that once.
    assert.deepEqual(groupImportedOrdersByDay([]), []);
  });
});

describe('the per-source tally', () => {
  it('counts each channel, biggest first', () => {
    const tally = importSourceTally([
      record({ accountSource: 'ecwid' }),
      record({ accountSource: 'google-sheets-transfer-orders' }),
      record({ accountSource: 'google-sheets-transfer-orders' }),
    ]);
    assert.deepEqual(tally, [
      { source: 'google-sheets-transfer-orders', count: 2 },
      { source: 'ecwid', count: 1 },
    ]);
  });

  it('a blank source is named, not silently merged into the biggest bucket', () => {
    assert.deepEqual(importSourceTally([record({ accountSource: '  ' })]), [
      { source: 'unknown', count: 1 },
    ]);
  });
});

describe('the queue-row adapter', () => {
  it('carries provenance and the facts the grid prints', () => {
    const row = importedOrderToQueueRow(record()) as unknown as Record<string, unknown>;
    assert.equal(row.id, 1);
    assert.equal(row.order_id, '03-15100-78271');
    assert.equal(row.sku, 'SHI-R8000');
    assert.equal(row.shipping_tracking_number, '9400111899223197428490');
    assert.equal(row.account_source, 'google-sheets-transfer-orders');
    assert.equal(row.created_at, '2026-09-03T17:30:00.000Z');
  });

  it('states the not-yet-started facts as null, never as filler', () => {
    // This view looks at the moment of ARRIVAL — before a tester, a packer or a
    // ship-by existed. The grid prints an em-dash for each, which is honest;
    // inventing a value would not be.
    const row = importedOrderToQueueRow(record()) as unknown as Record<string, unknown>;
    for (const field of ['tester_id', 'packer_id', 'ship_by_date', 'deadline_at', 'packed_at']) {
      assert.equal(row[field], null, `${field} must be null`);
    }
  });

  it('an order with no number still yields a row — the record is what arrived', () => {
    const row = importedOrderToQueueRow(
      record({ orderNumber: null, sku: null, trackingNumber: null }),
    ) as unknown as Record<string, unknown>;
    assert.equal(row.order_id, '');
    assert.equal(row.sku, '');
    assert.equal(row.shipping_tracking_number, null);
  });
});
