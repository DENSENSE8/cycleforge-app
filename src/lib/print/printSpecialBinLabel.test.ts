import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { routeScan } from '@/lib/barcode-routing';
import {
  isSpecialBinBarcode,
  printSpecialBinLabelJob,
  returnsBinPayloadToFace,
  specialBinFaceForBarcode,
  specialBinPayloadToFace,
} from '@/lib/print/printSpecialBinLabel';

describe('isSpecialBinBarcode', () => {
  it('recognizes seeded specials', () => {
    assert.equal(isSpecialBinBarcode('RETURNS-TEST'), true);
    assert.equal(isSpecialBinBarcode('TECH-PARTS'), true);
    assert.equal(isSpecialBinBarcode('UNSORTED'), true);
  });

  it('rejects structured location codes', () => {
    assert.equal(isSpecialBinBarcode('A0101101'), false);
    assert.equal(isSpecialBinBarcode(null), false);
  });

  it('honors a configured returns override', () => {
    assert.equal(isSpecialBinBarcode('RMA-QC', 'RMA-QC'), true);
    assert.equal(isSpecialBinBarcode('RETURNS-TEST', 'RMA-QC'), true);
  });
});

describe('specialBinPayloadToFace', () => {
  it('puts DataMatrix on the right with empty bottom-right', () => {
    const face = specialBinPayloadToFace(specialBinFaceForBarcode('TECH-PARTS'));
    assert.equal(face.topLeft, 'PARTS');
    assert.equal(face.bottomLeft, 'Technical Room');
    assert.equal(face.bottomRight, '');
    assert.equal(face.matrix.value, 'TECH-PARTS');
    assert.equal(face.hri, 'TECH-PARTS');
  });

  it('scanned matrix routes as a bin', () => {
    const face = specialBinPayloadToFace(specialBinFaceForBarcode('UNSORTED'));
    assert.equal(routeScan(face.matrix.value)?.type, 'bin');
  });
});

describe('printSpecialBinLabelJob', () => {
  it('skips structured aisle/bay codes', async () => {
    const result = await printSpecialBinLabelJob({ barcode: 'A0101101' });
    assert.equal(result, 'skipped');
  });
});

describe('returnsBinPayloadToFace', () => {
  it('keeps returns defaults', () => {
    const face = returnsBinPayloadToFace();
    assert.equal(face.topLeft, 'RETURNS');
    assert.equal(face.topRight, 'TEST');
    assert.equal(face.center, 'Returns testing bin');
    assert.equal(face.bottomLeft, 'Receiving');
    assert.equal(face.bottomRight, '');
    assert.equal(face.matrix.value, 'RETURNS-TEST');
  });
});
