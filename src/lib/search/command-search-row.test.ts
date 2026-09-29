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
