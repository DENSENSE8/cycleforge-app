import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { columnKeyForSelectionAction } from './column-action-slots';

const COLUMNS = [
  { key: 'select' },
  { key: 'thumb' },
  { key: 'fulfillment' },
  { key: 'item' },
  { key: 'state' },
  { key: 'status:1', fieldId: 'orders.picked' },
  { key: 'status:2', fieldId: 'orders.packed' },
  { key: 'status:3', fieldId: 'orders.scanned_out' },
  { key: 'actions' },
  { key: '_fill' },
] as const;

describe('columnKeyForSelectionAction', () => {
  it('maps verbs onto the compound tracks they edit', () => {
    assert.equal(columnKeyForSelectionAction('download-photos', COLUMNS), 'thumb');
    assert.equal(columnKeyForSelectionAction('copy', COLUMNS), 'fulfillment');
    assert.equal(columnKeyForSelectionAction('condition', COLUMNS), 'item');
    assert.equal(columnKeyForSelectionAction('qty', COLUMNS), 'item');
    assert.equal(columnKeyForSelectionAction('notes', COLUMNS), 'item');
    assert.equal(columnKeyForSelectionAction('ship-by', COLUMNS), 'state');
    assert.equal(columnKeyForSelectionAction('assign', COLUMNS), 'status:1');
    assert.equal(columnKeyForSelectionAction('assign-pick', COLUMNS), 'status:1');
    assert.equal(columnKeyForSelectionAction('assign-pack', COLUMNS), 'status:2');
    assert.equal(columnKeyForSelectionAction('scan-out', COLUMNS), 'status:3');
    assert.equal(columnKeyForSelectionAction('flag', COLUMNS), 'actions');
  });

  it('drops rail-only verbs rather than inventing a second toolbar', () => {
    assert.equal(columnKeyForSelectionAction('export', COLUMNS), null);
    assert.equal(columnKeyForSelectionAction('print', COLUMNS), null);
    assert.equal(columnKeyForSelectionAction('listing-rule', COLUMNS), null);
    assert.equal(columnKeyForSelectionAction('delete', COLUMNS), null);
  });
});
