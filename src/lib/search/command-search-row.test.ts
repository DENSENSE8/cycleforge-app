import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandSearchSecondLine } from './command-search-row';

test('an order leads with its number and keeps the product title as recognition context', () => {
  assert.equal(
    commandSearchSecondLine(
      {
        entityType: 'order',
        title: 'Bose Wave Music System III',
        subtitle: 'Isaac Rodriguez · 01-15216-30130 · eBay',
      },
      '01-15216-30130',
      true,
    ),
    'Bose Wave Music System III',
  );
});

test('the second line never repeats the primary identifier', () => {
  assert.equal(
    commandSearchSecondLine(
      { entityType: 'unit', title: 'Serial', subtitle: 'ABC123 · Used · SKU-1' },
      'ABC123',
      true,
    ),
    'Used · SKU-1',
  );
});

test('a SKU titled by its product keeps the SKU code on the second line; other named hits stay one line', () => {
  assert.equal(
    commandSearchSecondLine(
      { entityType: 'sku', title: 'Wireless adapter 300/ 700', subtitle: 'TMP-H5YM4-K68X4 · 25 on hand' },
      'Wireless adapter 300/ 700',
      false,
    ),
    'TMP-H5YM4-K68X4 · 25 on hand',
  );
  assert.equal(
    commandSearchSecondLine(
      { entityType: 'repair', title: 'Bose Wave', subtitle: '#10089 · Ana Ruiz' },
      'Bose Wave',
      false,
    ),
    '',
  );
});
