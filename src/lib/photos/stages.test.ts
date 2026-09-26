import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHOTO_EVIDENCE_STAGES,
  PhotoWriteViolationError,
  allowedPhotoTypesFor,
  assertPhotoWrite,
  photoStageLabel,
  stageFromPhotoType,
  validatePhotoWrite,
} from '@/lib/photos/stages';

describe('photo evidence write matrix', () => {
  it('constrained entities accept exactly their stage vocabulary', () => {
    const legal: Array<[Parameters<typeof validatePhotoWrite>[0]['entityType'], string]> = [
      ['RECEIVING', 'receiving_package'],
      ['RECEIVING', 'receiving_unbox_carton'],
      ['RECEIVING', 'receiving'],
      ['RECEIVING_LINE', 'receiving_item'],
      ['SERIAL_UNIT', 'testing_photo'],
      ['SERIAL_UNIT', 'packer_photo'],
      ['SERIAL_UNIT', 'prepack'],
      ['PACKER_LOG', 'packer_photo'],
      ['PACKER_LOG', 'box_label'],
      ['PACKER_LOG', 'pack_slip'],
      ['PACKER_LOG', 'pack_box'],
    ];
    for (const [entityType, photoType] of legal) {
      assert.equal(validatePhotoWrite({ entityType, photoType }), null, `${entityType} × ${photoType}`);
    }
  });

  // Regression: the guided Packer Review two-step capture (MobilePackerPhotoStudio → PackerPhotoUploadQueue → /api/photos/upload) sends…
  it('admits the guided Packer Review capture types as packing evidence', () => {
    for (const photoType of ['pack_slip', 'pack_box'] as const) {
      assert.equal(
        validatePhotoWrite({ entityType: 'PACKER_LOG', photoType }),
        null,
        `PACKER_LOG × ${photoType} must be writable`,
      );
      assert.equal(stageFromPhotoType('PACKER_LOG', photoType), 'packing');
    }
  });

  it('rejects cross-stage and free-text stamps on constrained entities', () => {
    const illegal: Array<[Parameters<typeof validatePhotoWrite>[0]['entityType'], string | null]> = [
      ['RECEIVING', 'receiving_item'],
      ['RECEIVING', 'my custom caption'],
      ['RECEIVING', null],
      ['RECEIVING_LINE', 'receiving_package'],
      ['RECEIVING_LINE', null],
      ['SERIAL_UNIT', 'receiving_item'],
      ['SERIAL_UNIT', 'shipout'],
      ['SERIAL_UNIT', null],
      ['PACKER_LOG', 'testing_photo'],
      ['PACKER_LOG', null],
    ];
    for (const [entityType, photoType] of illegal) {
      const message = validatePhotoWrite({ entityType, photoType });
      assert.ok(message, `${entityType} × ${photoType} should be rejected`);
      assert.match(message, /allowed:/);
    }
  });

  it('unconstrained entities pass anything, including null and custom types', () => {
    for (const entityType of ['SKU', 'SKU_STOCK', 'BIN_ADJUSTMENT', 'SHARE_PACK', 'ZENDESK_TICKET'] as const) {
      assert.equal(validatePhotoWrite({ entityType, photoType: null }), null);
      assert.equal(validatePhotoWrite({ entityType, photoType: 'my-org-custom-type' }), null);
      assert.equal(allowedPhotoTypesFor(entityType), null);
    }
  });

  it('normalizes case and whitespace before judging', () => {
    assert.equal(validatePhotoWrite({ entityType: 'RECEIVING', photoType: ' Receiving_Package ' }), null);
    assert.equal(validatePhotoWrite({ entityType: 'SERIAL_UNIT', photoType: 'TESTING_PHOTO' }), null);
  });

  it('assert form throws PhotoWriteViolationError', () => {
    assert.throws(
      () => assertPhotoWrite({ entityType: 'RECEIVING', photoType: 'receiving_item' }),
      (err: unknown) => err instanceof PhotoWriteViolationError,
    );
    assert.doesNotThrow(() =>
      assertPhotoWrite({ entityType: 'PACKER_LOG', photoType: 'box_label' }),
    );
  });
});

describe('stageFromPhotoType (five-stage spine)', () => {
  it('orders the spine arrival → unbox carton → unbox item → testing → packing', () => {
    assert.deepEqual(PHOTO_EVIDENCE_STAGES, [
      'arrival_package',
      'unbox_carton',
      'unbox_item',
      'testing',
      'packing',
    ]);
  });

  it('derives receiving stages via the receiving SoT', () => {
    assert.equal(stageFromPhotoType('RECEIVING', 'receiving_package'), 'arrival_package');
    assert.equal(stageFromPhotoType('RECEIVING', 'receiving_unbox_carton'), 'unbox_carton');
    assert.equal(stageFromPhotoType('RECEIVING', 'receiving'), 'arrival_package');
    assert.equal(stageFromPhotoType('RECEIVING', 'receiving_item'), null);
    assert.equal(stageFromPhotoType('RECEIVING_LINE', 'receiving_item'), 'unbox_item');
  });

  it('derives unit and packer stages including legacy aliases', () => {
    assert.equal(stageFromPhotoType('SERIAL_UNIT', 'testing_photo'), 'testing');
    assert.equal(stageFromPhotoType('SERIAL_UNIT', 'packer_photo'), 'packing');
    assert.equal(stageFromPhotoType('SERIAL_UNIT', 'prepack'), 'packing');
    assert.equal(stageFromPhotoType('SERIAL_UNIT', 'shipout'), 'packing');
    assert.equal(stageFromPhotoType('PACKER_LOG', 'packer_photo'), 'packing');
    assert.equal(stageFromPhotoType('PACKER_LOG', 'box_label'), 'packing');
  });

  it('returns null for non-stage evidence', () => {
    assert.equal(stageFromPhotoType('SKU', 'listing'), null);
    assert.equal(stageFromPhotoType('SERIAL_UNIT', 'listing'), null);
    assert.equal(stageFromPhotoType('ZENDESK_TICKET', null), null);
  });
});

describe('photoStageLabel', () => {
  it('renders the INDEX display labels', () => {
    assert.equal(photoStageLabel('arrival_package'), 'Arrival · package');
    assert.equal(photoStageLabel('unbox_carton'), 'Unbox · carton');
    assert.equal(photoStageLabel('unbox_item'), 'Unbox · item');
    assert.equal(photoStageLabel('testing'), 'Testing');
    assert.equal(photoStageLabel('packing'), 'Packing');
  });
});
