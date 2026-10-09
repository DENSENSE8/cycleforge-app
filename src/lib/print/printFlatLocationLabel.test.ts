import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeScan } from '@/lib/barcode-routing';
import { flatLocationFace } from '@/lib/print/printFlatLocationLabel';

describe('flatLocationFace', () => {
  it('puts the DataMatrix on the right with the barcode as HRI', () => {
    const face = flatLocationFace({ barcode: ' QA-SHELF-A01 ', name: 'QA Triage Shelf A-01', room: 'Receiving' });
    assert.equal(face.topLeft, 'LOCATION');
    assert.equal(face.topRight, '');
    assert.equal(face.center, 'QA Triage Shelf A-01');
    assert.equal(face.bottomLeft, 'Receiving');
    assert.equal(face.bottomRight, '');
    assert.equal(face.matrix.value, 'QA-SHELF-A01');
    assert.equal(face.matrix.symbology, 'datamatrix');
    assert.equal(face.hri, 'QA-SHELF-A01');
  });

  it('falls back to the code and a generic room', () => {
    const face = flatLocationFace({ barcode: 'DOOR-1', name: '  ', room: null });
    assert.equal(face.center, 'DOOR-1');
    assert.equal(face.bottomLeft, 'Warehouse');
  });

  it('takes a kicker and badge (station bench tags)', () => {
    const face = flatLocationFace({ barcode: 'PACK-1', kicker: 'STATION', badge: 'DESK' });
    assert.equal(face.topLeft, 'STATION');
    assert.equal(face.topRight, 'DESK');
  });

  it('scanned matrix routes as a bin', () => {
    const face = flatLocationFace({ barcode: 'QA-SHELF-A01' });
    assert.equal(routeScan(face.matrix.value)?.type, 'bin');
  });
});
