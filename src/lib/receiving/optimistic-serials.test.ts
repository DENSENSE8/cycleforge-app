import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendOptimisticSerial,
  confirmOptimisticSerial,
  markSerialRemoving,
  removeSerialById,
  rollbackOptimisticSerial,
} from './optimistic-serials';

describe('optimistic-serials', () => {
  it('appends a pending-add chip', () => {
    const next = appendOptimisticSerial([], 'ABC123', -1);
    assert.deepEqual(next, [{ id: -1, serial_number: 'ABC123', _optimistic: 'adding' }]);
  });

  it('confirms a temp serial with the server unit', () => {
    const next = confirmOptimisticSerial(
      [{ id: -1, serial_number: 'ABC123', _optimistic: 'adding' }],
      -1,
      { id: 42, serial_number: 'ABC123' },
    );
    assert.deepEqual(next, [{ id: 42, serial_number: 'ABC123', condition_grade: null }]);
  });

  it('marks and removes a serial optimistically', () => {
    const base = [{ id: 7, serial_number: 'SN7' }];
    const removing = markSerialRemoving(base, 7);
    assert.equal(removing[0]._optimistic, 'removing');
    assert.deepEqual(removeSerialById(removing, 7), []);
    assert.deepEqual(rollbackOptimisticSerial([{ id: -2, serial_number: 'X', _optimistic: 'adding' }], -2), []);
  });
});
