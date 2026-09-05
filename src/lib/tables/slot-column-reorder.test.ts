/**
 * Header track keys → catalog field ids.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dropSlotColumns } from './slot-column-reorder';

describe('dropSlotColumns', () => {
  const columns = [
    { key: 'select' },
    { key: 'item' },
    { key: 'status:1', fieldId: 'orders.picked' },
    { key: 'status:2', fieldId: 'orders.packed' },
    { key: '_fill' },
  ];

  it('maps two slot-track keys onto their bound field ids', () => {
    assert.deepEqual(dropSlotColumns('status:2', 'status:1', columns), {
      dragFieldId: 'orders.packed',
      dropFieldId: 'orders.picked',
    });
  });

  it('ignores chrome tracks and same-key drops', () => {
    assert.equal(dropSlotColumns('item', 'status:1', columns), null);
    assert.equal(dropSlotColumns('status:1', 'status:1', columns), null);
    assert.equal(dropSlotColumns('status:1', '_fill', columns), null);
  });
});
