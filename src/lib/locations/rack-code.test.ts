import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeShelfCode, routeScan, unwrapScannedLocation } from '@/lib/barcode-routing';
import { canonicalRackCode, parseRackCode, rackCode, rackFace, rackLabelPayload } from './rack-code';

const GLN = '0850012345671';

test('rackCode: no zero padding, dashes carry the levels', () => {
  assert.equal(rackCode({ rack: 12, shelf: null, position: null }), 'RK12');
  assert.equal(rackCode({ rack: 12, shelf: 3, position: null }), 'RK12-3');
  assert.equal(rackCode({ rack: 12, shelf: 3, position: 2 }), 'RK12-3-2');
  assert.equal(rackCode({ rack: 1203, shelf: null, position: null }), 'RK1203');
});

test('rackCode refuses impossible addresses', () => {
  assert.throws(() => rackCode({ rack: 0, shelf: null, position: null }), RangeError);
  assert.throws(() => rackCode({ rack: 1, shelf: 0, position: null }), RangeError);
  assert.throws(() => rackCode({ rack: 1, shelf: null, position: 2 }), RangeError);
  assert.throws(() => rackCode({ rack: 1.5, shelf: null, position: null }), RangeError);
});

test('parseRackCode: every spelling lands on one address', () => {
  const shelf = { rack: 12, shelf: 3, position: null };
  for (const raw of [
    'RK12-3',
    'rk12-3',
    ' RK12-3 ',
    'RK0012-03',
    `(414)${GLN}(254)RK12-3`,
    `414${GLN}\x1D254RK12-3`,
    `https://usavshop.com/414/${GLN}/254/RK12-3`,
  ]) {
    assert.deepEqual(parseRackCode(raw), shelf, raw);
  }
  assert.deepEqual(parseRackCode('RK123'), { rack: 123, shelf: null, position: null });
});

test('parseRackCode refuses non-rack strings', () => {
  for (const raw of ['', 'RK', 'RK-3', 'RK12-', 'RK12-3-2-1', 'RK0', 'RK12-0', 'RKA', 'RACK12', 'R-12', 'K12']) {
    assert.equal(parseRackCode(raw), null, raw);
  }
});

test('no collision: room-coded labels never parse as rack codes', () => {
  for (const raw of ['C-04-07-3', 'C-04-07-3-01', 'C0407300', 'A0101101', 'R-12', 'H-5', 'U-ABC', 'L-3', 'T-9', 'REP-4', 'KIT-1']) {
    assert.equal(parseRackCode(raw), null, raw);
  }
});

test('no collision: rack codes never take the room-coded branches', () => {
  for (const code of ['RK1', 'RK12-3', 'RK12-3-2', 'RK99999-99999-99999']) {
    const route = routeScan(code);
    assert.equal(route?.type, 'bin', code);
    assert.equal(route?.value, code, code);
    assert.equal(route?.redirect, `/inventory?bin=${code}`, code);
  }
});

test('routeScan: rack codes route from raw, GS1 AI and Digital Link spellings', () => {
  for (const raw of [
    'rk12-3',
    'RK0012-03',
    `(414)${GLN}(254)RK12-3`,
    `414${GLN}\x1D254RK12-3`,
    `https://usavshop.com/414/${GLN}/254/RK12-3`,
    `/414/${GLN}/254/rk12-3`,
  ]) {
    assert.equal(unwrapScannedLocation(raw), 'RK12-3', raw);
  }
});

test('routeScan: legacy room-coded labels still route unchanged', () => {
  assert.equal(unwrapScannedLocation('C-04-07-3-00'), 'C0407300');
  assert.equal(unwrapScannedLocation('C0407300'), 'C0407300');
  assert.equal(unwrapScannedLocation('C-04-07-3-02'), 'C0407302');
});

test('normalizeShelfCode: rack shelves compare across spellings', () => {
  assert.equal(normalizeShelfCode('rk12-3'), 'RK12-3');
  assert.equal(normalizeShelfCode(`(414)${GLN}(254)RK0012-03`), normalizeShelfCode('RK12-3'));
  assert.notEqual(normalizeShelfCode('RK123'), normalizeShelfCode('RK12-3'));
});

test('canonicalRackCode is null for non-rack input', () => {
  assert.equal(canonicalRackCode('C0407300'), null);
  assert.equal(canonicalRackCode('RK7'), 'RK7');
});

test('rackFace carries no room', () => {
  assert.deepEqual(rackFace({ rack: 12, shelf: null, position: null }), { headline: 'RACK 12', sub: null });
  assert.deepEqual(rackFace({ rack: 12, shelf: 3, position: null }), { headline: 'SHELF 3', sub: 'RACK 12' });
  assert.deepEqual(rackFace({ rack: 12, shelf: 3, position: 2 }), { headline: 'POS 2', sub: 'RACK 12 · SHELF 3' });
});

test('rackLabelPayload: GS1 AI 254 only with a licensed GLN', () => {
  const a = { rack: 12, shelf: 3, position: null };
  assert.deepEqual(rackLabelPayload(a), { symbology: 'datamatrix', value: 'RK12-3', gln: null, code: 'RK12-3' });
  const gs1 = rackLabelPayload(a, { gln: GLN });
  assert.equal(gs1.symbology, 'gs1datamatrix');
  assert.equal(gs1.value, `(414)${GLN}(254)RK12-3`);
  assert.equal(routeScan(gs1.value)?.value, 'RK12-3');
});
