import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { receivingStageColumnLabel } from '@/components/dashboard/queue-table/queue-table-chrome';

describe('queue-table-chrome', () => {
  it('maps activity axis to stage column labels', () => {
    assert.equal(receivingStageColumnLabel('unboxed'), 'Unboxed');
    assert.equal(receivingStageColumnLabel('scanned'), 'Scanned');
    assert.equal(receivingStageColumnLabel('tested'), 'Tested');
    assert.equal(receivingStageColumnLabel('received'), 'Received');
  });
});
