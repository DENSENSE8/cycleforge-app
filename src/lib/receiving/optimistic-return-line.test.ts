import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOptimisticReturnLine,
  mintOptimisticLineId,
  remapOptimisticLineId,
  rollbackOptimisticReturnLine,
  shouldPreserveCachedSerials,
} from './optimistic-return-line';

describe('optimistic-return-line', () => {
  it('builds an optimistic return line with an adding serial chip', () => {
    const line = buildOptimisticReturnLine({
      receivingId: 99,
      serial: 'SN123',
      condition: 'USED_A',
      tempLineId: -10,
      tempSerialId: -20,
    });
    assert.equal(line.id, -10);
    assert.equal(line.receiving_id, 99);
    assert.equal(line.item_name, 'Return serial SN123');
    assert.equal(line.condition_grade, 'USED_A');
    assert.equal(line.receiving_source, 'unmatched');
    assert.deepEqual(line.serials, [
      { id: -20, serial_number: 'SN123', _optimistic: 'adding' },
    ]);
  });

  it('mints negative temp line ids', () => {
    const a = mintOptimisticLineId();
    const b = mintOptimisticLineId();
    assert.ok(a < 0);
    assert.ok(b < 0);
  });

  it('remaps a temp line id onto the real server line, preserving optimistic serials', () => {
    const temp = buildOptimisticReturnLine({
      receivingId: 1,
      serial: 'ABC',
      condition: 'USED_B',
      tempLineId: -1,
      tempSerialId: -2,
    });
    const real = {
      id: 500,
      sku: 'SKU-1',
      item_name: 'Real name',
      quantity_expected: 1,
      quantity_received: 0,
      condition_grade: 'USED_B',
      workflow_status: 'MATCHED',
      listing_reference: null,
      location_code: null,
      serials: [] as typeof temp.serials,
    };
    const next = remapOptimisticLineId([temp], -1, real);
    assert.equal(next.length, 1);
    assert.equal(next[0].id, 500);
    assert.equal(next[0].item_name, 'Real name');
    assert.deepEqual(next[0].serials, temp.serials);
  });

  it('rolls back an optimistic return line by temp id', () => {
    const line = buildOptimisticReturnLine({
      receivingId: 1,
      serial: 'X',
      condition: 'USED_A',
      tempLineId: -7,
      tempSerialId: -8,
    });
    assert.deepEqual(rollbackOptimisticReturnLine([line], -7), []);
  });

  it('preserves cached serials when incoming is null or empty', () => {
    const cached = [{ id: 1, serial_number: 'SN1' }];
    assert.equal(shouldPreserveCachedSerials(null, cached), true);
    assert.equal(shouldPreserveCachedSerials(undefined, cached), true);
    assert.equal(shouldPreserveCachedSerials([], cached), true);
    assert.equal(
      shouldPreserveCachedSerials([{ id: 2, serial_number: 'SN2' }], cached),
      false,
    );
    assert.equal(shouldPreserveCachedSerials([], undefined), false);
    assert.equal(shouldPreserveCachedSerials([], []), false);
  });
});
