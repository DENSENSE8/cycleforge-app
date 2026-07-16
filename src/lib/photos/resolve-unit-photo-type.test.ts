import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveUnitPhotoTypeFromStage,
  UNIT_PACKING_PHOTO_TYPE,
  UNIT_TESTING_PHOTO_TYPE,
} from '@/lib/photos/types';

describe('resolveUnitPhotoTypeFromStage', () => {
  it('maps shipout / pack aliases to packer_photo', () => {
    assert.equal(resolveUnitPhotoTypeFromStage('shipout'), UNIT_PACKING_PHOTO_TYPE);
    assert.equal(resolveUnitPhotoTypeFromStage('pack'), UNIT_PACKING_PHOTO_TYPE);
    assert.equal(resolveUnitPhotoTypeFromStage('packing'), UNIT_PACKING_PHOTO_TYPE);
    assert.equal(resolveUnitPhotoTypeFromStage(null), UNIT_PACKING_PHOTO_TYPE);
    assert.equal(resolveUnitPhotoTypeFromStage(''), UNIT_PACKING_PHOTO_TYPE);
  });

  it('keeps prepack as prepack stage type', () => {
    assert.equal(resolveUnitPhotoTypeFromStage('prepack'), 'prepack');
  });

  it('maps testing stage to testing_photo', () => {
    assert.equal(resolveUnitPhotoTypeFromStage('testing'), UNIT_TESTING_PHOTO_TYPE);
    assert.equal(resolveUnitPhotoTypeFromStage('testing_photo'), UNIT_TESTING_PHOTO_TYPE);
  });
});
