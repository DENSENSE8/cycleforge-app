import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultFilter } from './SearchableSelectField';

test('a typed name narrows the list: an option with no meta is not a match for everything', () => {
  const options = [{ value: 1, label: 'eBay' }, { value: 2, label: 'AMZ' }, { value: 3, label: 'Shopify' }];
  assert.deepEqual(options.filter((o) => defaultFilter(o, 'Facebook Marketplace')), []);
  assert.deepEqual(options.filter((o) => defaultFilter(o, 'shop')).map((o) => o.value), [3]);
});

test('a scanned raw code still finds its formatted option either direction', () => {
  assert.equal(defaultFilter({ value: 1, label: 'C-02-01-2' }, 'C0201200'), true);
  assert.equal(defaultFilter({ value: 1, label: 'C-02-01-2' }, 'c-02'), true);
  assert.equal(defaultFilter({ value: 1, label: 'Bin', meta: 'C-02-01' }, 'C0201'), true);
});
