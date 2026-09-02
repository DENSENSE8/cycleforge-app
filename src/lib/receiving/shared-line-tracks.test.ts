import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INCOMING_COMPOUND_COLUMNS,
  RECEIVING_COMPOUND_COLUMNS,
} from '@/lib/receiving/receiving-grid-layout';

describe('receiving-family compound columns', () => {
  it('mounts one shared track grammar in both receiving surfaces', () => {
    const incomingKeys = INCOMING_COMPOUND_COLUMNS.map((column) => column.key);
    const receivingKeys = RECEIVING_COMPOUND_COLUMNS.map((column) => column.key);
    assert.deepEqual(incomingKeys, receivingKeys);
  });

  it('does not maintain a second line-track geometry source', () => {
    for (const columns of [INCOMING_COMPOUND_COLUMNS, RECEIVING_COMPOUND_COLUMNS]) {
      assert.equal(columns.filter((column) => column.key === 'item').length, 1);
      assert.equal(columns.filter((column) => column.key === 'fulfillment').length, 1);
    }
  });
});