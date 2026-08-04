import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_RETURNS_TEST_BIN_BARCODE,
  returnsTestBinSymbol,
} from '@/lib/inventory/returns-test-bin-symbol';
import { returnsBinPayloadToFace } from '@/lib/print/printReturnsBinLabel';
import { routeScan } from '@/lib/barcode-routing';

describe('returns-test-bin symbol', () => {
  it('defaults to RETURNS-TEST', () => {
    assert.equal(DEFAULT_RETURNS_TEST_BIN_BARCODE, 'RETURNS-TEST');
    assert.equal(returnsTestBinSymbol(), 'RETURNS-TEST');
  });

  it('honors an override', () => {
    assert.equal(returnsTestBinSymbol('RMA-QC'), 'RMA-QC');
  });
});

describe('returnsBinPayloadToFace (re-export)', () => {
  it('puts DataMatrix on the right with RETURNS-TEST HRI', () => {
    const face = returnsBinPayloadToFace();
    assert.equal(face.topLeft, 'RETURNS');
    assert.equal(face.bottomRight, '');
    assert.equal(face.matrix.value, 'RETURNS-TEST');
    assert.equal(routeScan(face.matrix.value)?.type, 'bin');
  });
});
