import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendSerialToSkuGroups,
  initSkuSerialGroups,
  mergeSkuSerialGroups,
  rebuildSkuSerialGroups,
} from './sku-serial-groups';

describe('initSkuSerialGroups', () => {
  it('seeds an empty group for a real order SKU', () => {
    assert.deepEqual(initSkuSerialGroups('ABC-1'), [{ sku: 'ABC-1', serials: [] }]);
  });

  it('returns empty when sku is blank and no serials', () => {
    assert.deepEqual(initSkuSerialGroups(null), []);
    assert.deepEqual(initSkuSerialGroups('N/A'), []);
  });

  it('places existing serials under the order SKU', () => {
    assert.deepEqual(initSkuSerialGroups('ABC-1', ['SN1', 'SN2']), [
      { sku: 'ABC-1', serials: ['SN1', 'SN2'] },
    ]);
  });
});

describe('mergeSkuSerialGroups', () => {
  it('creates a new group for a matched storage SKU', () => {
    const next = mergeSkuSerialGroups(
      [{ sku: 'ORDER-SKU', serials: [] }],
      '1809',
      ['SER-A'],
    );
    assert.deepEqual(next, [
      { sku: 'ORDER-SKU', serials: [] },
      { sku: '1809', serials: ['SER-A'] },
    ]);
  });

  it('dedupes serials into an existing group', () => {
    const next = mergeSkuSerialGroups(
      [{ sku: '1809', serials: ['SER-A'] }],
      '1809',
      ['SER-A', 'SER-B'],
    );
    assert.deepEqual(next, [{ sku: '1809', serials: ['SER-A', 'SER-B'] }]);
  });
});

describe('appendSerialToSkuGroups', () => {
  it('appends under the order SKU', () => {
    assert.deepEqual(appendSerialToSkuGroups(undefined, 'ORDER-SKU', 'SN9'), [
      { sku: 'ORDER-SKU', serials: ['SN9'] },
    ]);
  });
});

describe('rebuildSkuSerialGroups', () => {
  it('drops removed serials and keeps the surviving pairing', () => {
    const next = rebuildSkuSerialGroups(
      [
        { sku: '1809', serials: ['A', 'B'] },
        { sku: 'ORDER', serials: ['C'] },
      ],
      ['A', 'C'],
      'ORDER',
    );
    assert.deepEqual(next, [
      { sku: '1809', serials: ['A'] },
      { sku: 'ORDER', serials: ['C'] },
    ]);
  });

  it('falls back to an empty order-SKU row when all serials are undone', () => {
    assert.deepEqual(
      rebuildSkuSerialGroups([{ sku: '1809', serials: ['A'] }], [], 'ORDER-SKU'),
      [{ sku: 'ORDER-SKU', serials: [] }],
    );
  });
});
