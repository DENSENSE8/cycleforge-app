/** DataTable column reorder behavior. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dataTableColumnDrop } from './data-table-column-reorder';

describe('dataTableColumnDrop', () => {
  const columns = [
    { key: 'select' },
    { key: 'item' },
    { key: 'status:1', fieldId: 'orders.picked' },
    { key: 'status:2', fieldId: 'orders.packed' },
    { key: 'amount' },
  ];

  it('maps two table-column keys onto their bound field ids', () => {
    assert.deepEqual(dataTableColumnDrop('status:2', 'status:1', columns), {
      dragFieldId: 'orders.packed',
      dropFieldId: 'orders.picked',
    });
  });

  it('ignores chrome tracks and same-key drops', () => {
    assert.equal(dataTableColumnDrop('item', 'status:1', columns), null);
    assert.equal(dataTableColumnDrop('status:1', 'status:1', columns), null);
    assert.equal(dataTableColumnDrop('status:1', 'amount', columns), null);
  });
});
