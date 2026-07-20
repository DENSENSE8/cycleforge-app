import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  receivingStageColumnLabel,
  receivingTableScopeLabel,
} from '@/components/dashboard/queue-table/queue-table-chrome';

describe('queue-table-chrome', () => {
  it('maps receiving table modes to toolbar scope labels', () => {
    assert.equal(receivingTableScopeLabel('unbox_queue'), 'Door queue');
    assert.equal(receivingTableScopeLabel('unbox_viewed'), 'Recently viewed');
    assert.equal(receivingTableScopeLabel('history'), 'History');
  });

  it('maps activity axis to stage column labels', () => {
    assert.equal(receivingStageColumnLabel('unboxed'), 'Unboxed');
    assert.equal(receivingStageColumnLabel('scanned'), 'Scanned');
  });
});
