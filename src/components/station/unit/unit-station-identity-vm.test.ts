import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUnitStationIdentityVM,
  unitLifecycleFace,
  type UnitIdentityInput,
} from './unit-station-identity-vm';

function unit(over: Partial<UnitIdentityInput> = {}): UnitIdentityInput {
  return {
    id: 5150,
    serial_number: 'SN-ABC-99871',
    unit_uid: 'XT8000-2634-000412',
    sku: 'XT8000',
    product_title: 'Shimano Deore XT M8000',
    current_status: 'STOCKED',
    current_location: 'A-12-3',
    condition_grade: 'USED_A',
    ...over,
  };
}

test('the serial leads; the minted uid is only a fallback', () => {
  assert.equal(buildUnitStationIdentityVM(unit()).leadDisplay, 'SN-ABC-99871');
  assert.equal(buildUnitStationIdentityVM(unit()).leadIsMintedUid, false);

  const noSerial = buildUnitStationIdentityVM(unit({ serial_number: '   ' }));
  assert.equal(noSerial.leadDisplay, 'XT8000-2634-000412');
  assert.equal(noSerial.leadIsMintedUid, true);
  // The copy value stays honest — never the minted uid masquerading as a serial.
  assert.equal(noSerial.serialValue, '');
});

test('a unit with neither serial nor uid shows a dash, not an empty row', () => {
  const vm = buildUnitStationIdentityVM(unit({ serial_number: null, unit_uid: null }));
  assert.equal(vm.leadDisplay, '—');
  assert.equal(vm.leadIsMintedUid, false);
});

test('an UNGRADED unit reads as a dash, never as BRAND_NEW', () => {
  // conditionLabel() defaults a null code to BRAND_NEW. A unit that has not
  // reached testing is ungraded, and claiming NEW would be a fabricated fact.
  for (const grade of [null, undefined, '']) {
    const vm = buildUnitStationIdentityVM(unit({ condition_grade: grade }));
    assert.equal(vm.conditionGrade, null);
    assert.equal(vm.conditionText, '—');
  }
  assert.equal(buildUnitStationIdentityVM(unit()).conditionText, 'A');
});

test('grade codes normalize before they are labelled', () => {
  assert.equal(buildUnitStationIdentityVM(unit({ condition_grade: 'used-a' })).conditionGrade, 'USED_A');
  assert.equal(buildUnitStationIdentityVM(unit({ condition_grade: 'new' })).conditionGrade, 'BRAND_NEW');
});

test('lifecycle resolves both classes and a human label', () => {
  const face = unitLifecycleFace('IN_REPAIR');
  assert.ok(face);
  assert.equal(face.label, 'IN REPAIR');
  assert.ok(face.dotClass.length > 0);
  assert.ok(face.pillClass.length > 0);
});

test('an unrecognized status is shown verbatim, not swallowed into Unknown', () => {
  const face = unitLifecycleFace('SOME_FUTURE_STATE');
  assert.ok(face);
  assert.equal(face.label, 'SOME FUTURE STATE');
});

test('no status at all hides the lifecycle slot rather than inventing one', () => {
  assert.equal(unitLifecycleFace(null), null);
  assert.equal(unitLifecycleFace('  '), null);
  assert.equal(buildUnitStationIdentityVM(unit({ current_status: null })).lifecycle, null);
});
