import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { printLabelOptionsToFace } from '@/lib/print/labelFaceBitmap';

describe('printLabelOptionsToFace', () => {
  it('keeps an explicit face for the USB raster', () => {
    const face = {
      kind: 'receiving' as const,
      topLeft: 'Tote',
      topRight: '',
      center: 'H-9',
      bottomLeft: '',
      bottomRight: '',
      matrix: { value: 'H-9', symbology: 'datamatrix' as const, scale: 4 },
      hri: 'H-9',
    };
    assert.equal(printLabelOptionsToFace({ face, dataMatrix: face.matrix }), face);
  });

  it('synthesizes a face from name + matrix when callers omit it', () => {
    const made = printLabelOptionsToFace({
      name: 'Tote',
      hri: 'H-1',
      dataMatrix: { value: 'H-1', symbology: 'datamatrix', scale: 4 },
    });
    assert.equal(made.topLeft, 'Tote');
    assert.equal(made.center, 'H-1');
    assert.equal(made.matrix.value, 'H-1');
    assert.equal(made.hri, 'H-1');
  });
});
