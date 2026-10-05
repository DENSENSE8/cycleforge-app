import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchScanToTask,
  type PickTask,
} from '../../app/m/(shell)/pick/[orderId]/_picker/picker-shared';
import { pickScanKey, unitsForScan, wrongUnitLabelRefusal, type PickScanUnit } from './pick-scan-unit';

const KIT = 'KIT-SPKR-2640-000012';

const left: PickScanUnit = { serialUnitId: 11, serialNumber: 'SN-LEFT', unitUid: '00072-BK-2640-000001', packageUid: KIT };
const right: PickScanUnit = { serialUnitId: 12, serialNumber: 'SN-RIGHT', unitUid: '00072-BK-2640-000002', packageUid: KIT };
const loose: PickScanUnit = { serialUnitId: 13, serialNumber: 'SN-LOOSE', unitUid: '00072-BK-2640-000003', packageUid: null };
const units = [left, right, loose];

function task(unit: PickScanUnit): PickTask {
  return {
    ...unit,
    allocationId: unit.serialUnitId * 10,
    lineId: 1,
    sku: '00072-BK',
    productTitle: null,
    bin: 'A-1',
    conditionGrade: null,
    plannedQty: 1,
    currentState: 'ALLOCATED',
    platforms: [],
  };
}

test('a package label is its own scan kind', () => {
  assert.deepEqual(pickScanKey(`  ${KIT} `), { kind: 'package', key: KIT });
});

test('a package scan names every member and no non-member', () => {
  assert.deepEqual(unitsForScan(KIT, units), [left, right]);
  assert.deepEqual(unitsForScan(KIT.toLowerCase(), units), [left, right]);
  assert.deepEqual(unitsForScan('KIT-SPKR-2640-000099', units), []);
});

test('a package scan arms the gate for a member task only', () => {
  assert.equal(matchScanToTask(KIT, task(left)), 'serial');
  assert.equal(matchScanToTask(KIT, task(right)), 'serial');
  assert.equal(matchScanToTask(KIT, task(loose)), null);
});

test('a package scan for a non-member task is refused as the wrong package', () => {
  assert.equal(
    wrongUnitLabelRefusal(KIT, [loose]),
    `Wrong package — this label is ${KIT}; the order holds SN-LOOSE.`,
  );
  assert.equal(wrongUnitLabelRefusal(KIT, [left]), null);
});

test('serial / unit_uid / unit-id matching is unchanged', () => {
  assert.deepEqual(unitsForScan('sn-right', units), [right]);
  assert.deepEqual(unitsForScan('00072-BK-2640-000003', units), [loose]);
  assert.deepEqual(unitsForScan('U-11', units), [left]);
  // A bare all-digit scan never names a unit by id.
  assert.deepEqual(unitsForScan('11', units), []);
  // A unit's serial never matches its package's label, nor the reverse.
  assert.deepEqual(unitsForScan('SN-LEFT', units), [left]);
  assert.equal(matchScanToTask('SN-LEFT', task(left)), 'serial');
  assert.equal(matchScanToTask('SN-LEFT', task(right)), null);
  assert.equal(
    wrongUnitLabelRefusal('U-99', [left]),
    'Wrong unit — this label is 99; the order holds SN-LEFT.',
  );
});
