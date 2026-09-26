import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  directedPickStep,
  groupDirectedPickLines,
  matchItemScan,
  matchesLocationScan,
  type DirectedPickUnitRow,
} from './directed-pick';

const row = (over: Partial<DirectedPickUnitRow>): DirectedPickUnitRow => ({
  allocationId: 1,
  serialUnitId: 10,
  serialNumber: null,
  sku: '00114-P-1',
  title: 'Bose Solo & Cinemate - Remote Control',
  imageUrl: null,
  locationName: 'C-04-09-2',
  locationBarcode: 'C0409200',
  locationRoom: 'Zone 3 - Parts',
  rawLocation: null,
  platforms: [],
  ...over,
});

describe('groupDirectedPickLines', () => {
  it('folds same SKU + same bin into one line and keeps the walk order', () => {
    const lines = groupDirectedPickLines(7, [
      row({ allocationId: 1, serialUnitId: 10 }),
      row({ allocationId: 2, serialUnitId: 11, sku: '00080-P-1', locationName: 'C-04-11-3', locationBarcode: 'C0411300' }),
      row({ allocationId: 3, serialUnitId: 12 }),
    ]);
    assert.deepEqual(
      lines.map((l) => [l.sku, l.location?.barcode, l.units.map((u) => u.allocationId)]),
      [
        ['00114-P-1', 'C0409200', [1, 3]],
        ['00080-P-1', 'C0411300', [2]],
      ],
    );
  });

  it('splits one SKU across two bins, and leaves an unbinned unit without a location step', () => {
    const lines = groupDirectedPickLines(7, [
      row({ allocationId: 1 }),
      row({ allocationId: 2, locationName: 'C-04-01-1', locationBarcode: 'C0401100' }),
      row({ allocationId: 3, locationName: null, locationBarcode: null, locationRoom: null }),
    ]);
    assert.equal(lines.length, 3);
    assert.equal(lines[2].location, null);
    assert.equal(directedPickStep({ line: lines[2], toteArmed: true, locationConfirmed: false, pickedCount: 0 }), 'item');
  });
});

describe('matchesLocationScan', () => {
  const location = { name: 'C-04-09-2', barcode: 'C0409200', room: null };
  it('accepts the label barcode and the typed face, however punctuated', () => {
    assert.equal(matchesLocationScan('C0409200', location), true);
    assert.equal(matchesLocationScan(' c-04-09-2 ', location), true);
  });
  it('refuses a neighbouring bin', () => {
    assert.equal(matchesLocationScan('C0409300', location), false);
    assert.equal(matchesLocationScan('', location), false);
  });
});

describe('matchItemScan', () => {
  // Marketplace ids belong to the SKU, so every row of it carries them.
  const platforms = [{ platformSku: 'AMZ-1', platformItemId: null }];
  const [line] = groupDirectedPickLines(7, [
    row({ allocationId: 1, serialUnitId: 10, serialNumber: 'SN-A', platforms }),
    row({ allocationId: 2, serialUnitId: 11, serialNumber: 'SN-B', platforms }),
  ]);

  it('a serial picks that unit; a repeat of a picked serial is refused', () => {
    assert.equal(matchItemScan('sn-b', line, new Set()), 2);
    assert.equal(matchItemScan('SN-B', line, new Set([2])), null);
  });

  it('a SKU, marketplace id or unit QR picks an open unit', () => {
    assert.equal(matchItemScan('00114-p-1', line, new Set([1])), 2);
    assert.equal(matchItemScan('AMZ-1', line, new Set()), 1);
    assert.equal(matchItemScan('https://x.test/m/u/11', line, new Set()), 2);
  });

  it('refuses another product and a full line', () => {
    assert.equal(matchItemScan('00080-P-1', line, new Set()), null);
    assert.equal(matchItemScan('00114-P-1', line, new Set([1, 2])), null);
  });
});

describe('directedPickStep', () => {
  const [line] = groupDirectedPickLines(7, [row({ allocationId: 1 }), row({ allocationId: 2 })]);
  it('runs tote → location → item until every unit is picked', () => {
    const at = (toteArmed: boolean, locationConfirmed: boolean, pickedCount: number) =>
      directedPickStep({ line, toteArmed, locationConfirmed, pickedCount });
    assert.equal(at(false, false, 0), 'tote');
    assert.equal(at(true, false, 0), 'location');
    assert.equal(at(true, true, 1), 'item');
    assert.equal(at(true, true, 2), 'done');
    assert.equal(directedPickStep({ line: null, toteArmed: true, locationConfirmed: true, pickedCount: 0 }), 'done');
  });
});
