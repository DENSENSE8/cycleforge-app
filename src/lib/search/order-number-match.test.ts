import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  compactOrderNumber,
  identifierChipLast8Compact,
  identifierEqualsQuery,
  identifierLast8Compact,
  identifierLast8Digits,
  looksLikeMarketplaceOrderNumber,
  orderNumberEqualsQuery,
  orderNumberLast8Digits,
  serialNumberEqualsQuery,
  sqlIdentifierEqualsQuery,
} from './order-number-match';
import {
  headerFindEmptyMessage,
  headerFindSearchAxis,
} from './search-by';

const EBAY = '02-14684-13689';
const SERIAL = 'C02-XMH-12345678';

describe('orderNumberEqualsQuery', () => {
  it('matches the full marketplace id, including dash-stripped paste', () => {
    assert.equal(orderNumberEqualsQuery(EBAY, '02-14684-13689'), true);
    assert.equal(orderNumberEqualsQuery(EBAY, '021468413689'), true);
    assert.equal(orderNumberEqualsQuery('11-15067-72584', '11-15067-72584'), true);
    assert.equal(orderNumberEqualsQuery('11-15067-72584', '111506772584'), true);
  });

  it('does not treat a short fragment as a hit on a longer order #', () => {
    assert.equal(orderNumberEqualsQuery(EBAY, '4989'), false);
    assert.equal(orderNumberEqualsQuery(EBAY, '14684'), false);
    assert.equal(orderNumberEqualsQuery('27-14721-28101', '4721'), false);
    assert.equal(orderNumberEqualsQuery(EBAY, '1468413689'), false);
  });

  it('matches exact last-8 digits, dashed or undashed', () => {
    assert.equal(orderNumberEqualsQuery(EBAY, '68413689'), true);
    assert.equal(orderNumberEqualsQuery(EBAY, '6841-3689'), true);
    assert.equal(orderNumberLast8Digits('4989'), '');
    assert.equal(orderNumberLast8Digits(EBAY), '68413689');
    assert.equal(identifierLast8Compact(EBAY), '68413689');
  });

  it('matches the chip last-8 (trailing 8 raw characters)', () => {
    assert.equal(identifierChipLast8Compact(EBAY), '8413689');
    assert.equal(orderNumberEqualsQuery(EBAY, '84-13689'), true);
  });
});

describe('serialNumberEqualsQuery', () => {
  it('matches full serial dashed and undashed', () => {
    assert.equal(serialNumberEqualsQuery(SERIAL, SERIAL), true);
    assert.equal(serialNumberEqualsQuery(SERIAL, 'C02XMH12345678'), true);
    assert.equal(identifierEqualsQuery(SERIAL, 'c02-xmh-12345678'), true);
  });

  it('matches exact last-8 of the serial, dashed or undashed', () => {
    assert.equal(serialNumberEqualsQuery(SERIAL, '12345678'), true);
    assert.equal(serialNumberEqualsQuery(SERIAL, '1234-5678'), true);
    assert.equal(identifierLast8Compact(SERIAL), '12345678');
    assert.equal(identifierLast8Digits(SERIAL), '12345678');
  });

  it('does not treat a short fragment as a serial hit', () => {
    assert.equal(serialNumberEqualsQuery(SERIAL, '5678'), false);
    assert.equal(serialNumberEqualsQuery(SERIAL, '12345'), false);
  });
});

describe('sqlIdentifierEqualsQuery', () => {
  it('pins last-8 and dash-strip in SQL', () => {
    const sql = sqlIdentifierEqualsQuery('o.order_id', '$3');
    assert.match(sql, /length\(.*\) = 8/);
    assert.match(sql, /RIGHT\(/);
    assert.ok(sql.includes("[^a-z0-9]"));
    assert.ok(sql.includes("RIGHT(COALESCE(o.order_id, ''), 8)"));
  });
});

describe('looksLikeMarketplaceOrderNumber', () => {
  it('accepts eBay 2-5-5, Amazon 3-7-7, and compact digit pastes', () => {
    assert.equal(looksLikeMarketplaceOrderNumber('11-15067-72584'), true);
    assert.equal(looksLikeMarketplaceOrderNumber('111-1234567-1234567'), true);
    assert.equal(looksLikeMarketplaceOrderNumber('111506772584'), true);
    assert.equal(looksLikeMarketplaceOrderNumber('R-99'), false);
    assert.equal(looksLikeMarketplaceOrderNumber('4989'), false);
  });
});

describe('compactOrderNumber', () => {
  it('strips separators', () => {
    assert.equal(compactOrderNumber(' 02-14684-13689 '), '021468413689');
  });
});

describe('headerFindSearchAxis', () => {
  it('unscoped identifier queries do not use Internal ID', () => {
    assert.equal(headerFindSearchAxis(false, 'internal', '4989'), undefined);
    assert.equal(headerFindSearchAxis(false, 'internal', EBAY), undefined);
    assert.equal(headerFindSearchAxis(false, 'internal', '12345678'), undefined);
  });

  it('a dashed marketplace # never uses Internal ID even with that chip on', () => {
    assert.equal(headerFindSearchAxis(true, 'internal', '11-15067-72584'), undefined);
    assert.equal(headerFindSearchAxis(true, 'order', '11-15067-72584'), 'order');
  });

  it('unscoped natural language has no axis (cross-entity title search)', () => {
    assert.equal(headerFindSearchAxis(false, 'internal', 'bose speaker'), undefined);
  });

  it('an explicit method wins', () => {
    assert.equal(headerFindSearchAxis(true, 'internal', '4989'), 'internal');
    assert.equal(headerFindSearchAxis(true, 'serial', '12345678'), 'serial');
    assert.equal(headerFindSearchAxis(true, 'order', '4989'), 'order');
  });
});

describe('headerFindEmptyMessage', () => {
  it('order-number misses name the miss', () => {
    assert.equal(headerFindEmptyMessage('4989', 'order'), 'No order number found in the system');
    assert.equal(
      headerFindEmptyMessage('4989', undefined),
      'No order number found in the system',
    );
    assert.equal(
      headerFindEmptyMessage('68413689', undefined),
      'No order number found in the system',
    );
  });

  it('serial-axis misses name the miss', () => {
    assert.equal(
      headerFindEmptyMessage('12345678', 'serial'),
      'No serial number found in the system',
    );
  });

  it('other misses stay generic', () => {
    assert.equal(headerFindEmptyMessage('bose speaker', undefined), 'No matches for “bose speaker”');
    assert.equal(headerFindEmptyMessage('4989', 'internal'), 'No matches for “4989”');
  });
});
