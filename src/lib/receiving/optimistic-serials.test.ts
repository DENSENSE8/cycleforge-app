import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendOptimisticSerial,
  confirmOptimisticSerial,
  markSerialRemoving,
  removeSerialById,
  rollbackOptimisticSerial,
  setSerialGrade,
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

  it('stamps a per-unit grade onto the matching serial only', () => {
    const base = [
      { id: 7, serial_number: 'SN7', condition_grade: 'USED_A' },
      { id: 8, serial_number: 'SN8', condition_grade: 'USED_A' },
    ];
    const next = setSerialGrade(base, 8, 'USED_B');
    assert.deepEqual(next, [
      { id: 7, serial_number: 'SN7', condition_grade: 'USED_A' },
      { id: 8, serial_number: 'SN8', condition_grade: 'USED_B' },
    ]);
    // No-op when the id is absent.
    assert.deepEqual(setSerialGrade(base, 99, 'USED_C'), base);
  });
});
