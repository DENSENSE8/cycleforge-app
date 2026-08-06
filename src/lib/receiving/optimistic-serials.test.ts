import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendOptimisticSerial,
  bindSerialsToUnitSlots,
  confirmOptimisticSerial,
  markSerialRemoving,
  removeSerialById,
  rollbackOptimisticSerial,
  setSerialGrade,
  unlinkSerialFromLineUnits,
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

  it('unlinkSerialFromLineUnits clears the matching unit link', () => {
    const units = [
      { id: 1, serial_unit_id: 7, serial: 'SN7' },
      { id: 2, serial_unit_id: 8, serial: 'SN8' },
    ];
    assert.deepEqual(unlinkSerialFromLineUnits(units, 7), [
      { id: 1, serial_unit_id: null, serial: null },
      { id: 2, serial_unit_id: 8, serial: 'SN8' },
    ]);
    assert.equal(unlinkSerialFromLineUnits(null, 7), null);
  });

  it('bindSerialsToUnitSlots hides in-flight removing serials', () => {
    const units = [{ serial_unit_id: 7 }, { serial_unit_id: null }];
    const saved = [
      { id: 7, serial_number: 'SN7', _optimistic: 'removing' as const },
      { id: 8, serial_number: 'SN8' },
    ];
    // Slot 0 stays empty (claimed by removing id); SN8 fills slot 1.
    assert.deepEqual(bindSerialsToUnitSlots(units, saved), [
      null,
      { id: 8, serial_number: 'SN8' },
    ]);
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

  it('clears a per-unit grade with empty or null', () => {
    const base = [{ id: 8, serial_number: 'SN8', condition_grade: 'USED_A' }];
    assert.deepEqual(setSerialGrade(base, 8, ''), [
      { id: 8, serial_number: 'SN8', condition_grade: null },
    ]);
    assert.deepEqual(setSerialGrade(base, 8, null), [
      { id: 8, serial_number: 'SN8', condition_grade: null },
    ]);
  });

  it('bindSerialsToUnitSlots fills empty units from unbound saved by ordinal', () => {
    const units = [
      { serial_unit_id: null },
      { serial_unit_id: null },
      { serial_unit_id: null, serial_absent: true },
    ];
    const saved = [
      { id: -1, serial_number: 'AAA', _optimistic: 'adding' as const },
      { id: -2, serial_number: 'BBB', _optimistic: 'adding' as const },
    ];
    const bound = bindSerialsToUnitSlots(units, saved);
    assert.equal(bound[0]?.serial_number, 'AAA');
    assert.equal(bound[1]?.serial_number, 'BBB');
    assert.equal(bound[2], null, 'waived unit does not take an unbound serial');
  });

  it('bindSerialsToUnitSlots prefers linked serial_unit_id over ordinal fill', () => {
    const units = [
      { serial_unit_id: 8 },
      { serial_unit_id: null },
    ];
    const saved = [
      { id: 8, serial_number: 'LINKED' },
      { id: -1, serial_number: 'OPT', _optimistic: 'adding' as const },
    ];
    const bound = bindSerialsToUnitSlots(units, saved);
    assert.equal(bound[0]?.serial_number, 'LINKED');
    assert.equal(bound[1]?.serial_number, 'OPT');
  });

  it('bindSerialsToUnitSlots skips serials marked removing', () => {
    const units = [{ serial_unit_id: null }, { serial_unit_id: null }];
    const saved = [
      { id: 7, serial_number: 'GONE', _optimistic: 'removing' as const },
      { id: 8, serial_number: 'KEEP' },
    ];
    const bound = bindSerialsToUnitSlots(units, saved);
    assert.equal(bound[0]?.serial_number, 'KEEP');
    assert.equal(bound[1], null);
  });
});
