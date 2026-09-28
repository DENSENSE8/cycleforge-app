import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysBetweenOrders,
  duplicateLeadCopy,
  duplicateSkuKey,
  groupDuplicateOrders,
  parseDuplicateWindowDays,
  type PossibleDuplicateMatch,
} from './possible-duplicates';

describe('parseDuplicateWindowDays', () => {
  it('defaults to 30 for missing, non-numeric, zero, negative or fractional input', () => {
    for (const raw of [null, undefined, '', 'abc', '0', '-5', '7.5', ' ']) {
      assert.equal(parseDuplicateWindowDays(raw), 30, String(raw));
    }
  });
  it('accepts whole days and caps at 365', () => {
    assert.equal(parseDuplicateWindowDays('1'), 1);
    assert.equal(parseDuplicateWindowDays(' 14 '), 14);
    assert.equal(parseDuplicateWindowDays('365'), 365);
    assert.equal(parseDuplicateWindowDays('9999'), 365);
  });
});

describe('duplicateSkuKey', () => {
  it('prefers the catalog SKU over the raw line SKU', () => {
    assert.equal(duplicateSkuKey('ABC-1', 'amazon-asin'), 'ABC-1');
  });
  it('falls back to the line SKU only when there is no catalog SKU', () => {
    assert.equal(duplicateSkuKey(null, ' abc-1 '), 'ABC-1');
    assert.equal(duplicateSkuKey(undefined, 'abc-1'), 'ABC-1');
  });
  it('keeps an empty catalog SKU (CASE semantics, not COALESCE-on-blank)', () => {
    assert.equal(duplicateSkuKey('', 'abc-1'), '');
  });
  it('reads no SKU as the empty key', () => {
    assert.equal(duplicateSkuKey(null, null), '');
  });
});

describe('daysBetweenOrders', () => {
  it('counts calendar days, positive when the other order came earlier', () => {
    assert.equal(daysBetweenOrders('2026-09-10T01:00:00Z', '2026-09-07T23:00:00Z'), 3);
  });
  it('is negative when the other order came later', () => {
    assert.equal(daysBetweenOrders('2026-09-07T12:00:00Z', '2026-09-10T12:00:00Z'), -3);
  });
  it('is 0 on the same UTC date regardless of time', () => {
    assert.equal(daysBetweenOrders('2026-09-07T23:59:00Z', '2026-09-07T00:01:00Z'), 0);
  });
  it('is null when either date is missing or unreadable', () => {
    assert.equal(daysBetweenOrders(null, '2026-09-07T00:00:00Z'), null);
    assert.equal(daysBetweenOrders('2026-09-07T00:00:00Z', 'nope'), null);
  });
});

describe('duplicateLeadCopy', () => {
  it('reads earlier, later and same-day matches', () => {
    assert.equal(duplicateLeadCopy(1), 'Same buyer ordered this SKU 1 day ago');
    assert.equal(duplicateLeadCopy(12), 'Same buyer ordered this SKU 12 days ago');
    assert.equal(duplicateLeadCopy(-2), 'Same buyer ordered this SKU again 2 days later');
    assert.equal(duplicateLeadCopy(0), 'Same buyer ordered this SKU the same day');
  });
});

describe('groupDuplicateOrders', () => {
  const match = (orderRowId: number, orderNumber: string, orderDate: string): PossibleDuplicateMatch => ({
    orderRowId,
    orderNumber,
    orderDate,
    sku: 'ABC-1',
    quantity: '1',
  });

  it('keeps one entry per order number and orders nearest-first either side', () => {
    const grouped = groupDuplicateOrders(
      [
        match(1, 'A-100', '2026-09-01T00:00:00Z'),
        match(2, 'A-100', '2026-09-01T00:00:00Z'),
        match(3, 'B-200', '2026-09-12T00:00:00Z'),
        match(4, 'C-300', '2026-09-09T00:00:00Z'),
      ],
      '2026-09-10T00:00:00Z',
    );
    assert.deepEqual(
      grouped.map((g) => [g.orderNumber, g.orderRowId, g.days]),
      [
        ['C-300', 4, 1],
        ['B-200', 3, -2],
        ['A-100', 1, 9],
      ],
    );
  });
});
