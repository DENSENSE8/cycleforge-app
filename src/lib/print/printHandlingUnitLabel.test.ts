/**
 * Tote / LPN 2×1 label face — shared LabelFaceModel, not a forked type scale.
 *
 * Run: `npx tsx --test src/lib/print/printHandlingUnitLabel.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handlingUnitHandle } from '@/lib/barcode-routing';
import { handlingUnitPayloadToFace } from '@/lib/print/printHandlingUnitLabel';

describe('handlingUnitPayloadToFace', () => {
  it('puts Tote + handle on the shared receiving grid with HRI', () => {
    const face = handlingUnitPayloadToFace({ handlingUnitId: 1 });
    const handle = handlingUnitHandle(1);
    assert.equal(face.kind, 'receiving');
    assert.equal(face.topLeft, 'Tote');
    assert.equal(face.topRight, '');
    assert.equal(face.center, handle);
    assert.equal(face.bottomLeft, '');
    assert.equal(face.bottomRight, '');
    assert.equal(face.matrix.value, handle);
    assert.equal(face.matrix.symbology, 'datamatrix');
    assert.equal(face.hri, handle);
  });

  it('omits zero unit count and print date from the face', () => {
    const face = handlingUnitPayloadToFace({
      handlingUnitId: 12,
      unitCount: 0,
      date: '9/4/2026',
    });
    assert.equal(face.bottomRight, '');
    assert.equal(face.topRight, '');
  });

  it('shows a live count and location when present', () => {
    const face = handlingUnitPayloadToFace({
      handlingUnitId: 12,
      unitCount: 4,
      locationName: 'Receiving',
    });
    assert.equal(face.bottomLeft, 'Receiving');
    assert.equal(face.bottomRight, '4 units');
  });

  it('singular unit copy', () => {
    const face = handlingUnitPayloadToFace({ handlingUnitId: 3, unitCount: 1 });
    assert.equal(face.bottomRight, '1 unit');
  });
});
