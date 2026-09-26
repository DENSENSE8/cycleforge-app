import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECEIVING_PHOTO_ITEM,
  RECEIVING_PHOTO_LEGACY_PACKAGE,
  RECEIVING_PHOTO_PACKAGE,
  RECEIVING_PHOTO_STAGES,
  RECEIVING_PHOTO_UNBOX_CARTON,
  assertReceivingPhotoWrite,
  ReceivingPhotoWriteError,
  isCartonPhotoType,
  isItemPhotoType,
  isPackagePhotoType,
  isUnboxCartonPhotoType,
  photoIntentFromStage,
  photoStageForScanIntakeSurface,
  receivingEntityTypeForStage,
  receivingPhotoIntentSql,
  receivingPhotoTypeForStage,
  receivingStageFromPhotoType,
  receivingUploadStage,
  remapReceivingPhotoTypeOnMove,
  remapReceivingPhotoTypeOnStageClaim,
  validateReceivingPhotoWrite,
} from '@/lib/receiving/photo-intent';

describe('photoStageForScanIntakeSurface (scan auto-push stage)', () => {
  it('maps Unbox intake to unbox_carton (per-scan spam, not guided arrival)', () => {
    assert.equal(photoStageForScanIntakeSurface('unbox'), 'unbox_carton');
  });

  it('maps Arrival/triage intake to arrival_package (guided door studio)', () => {
    assert.equal(photoStageForScanIntakeSurface('triage'), 'arrival_package');
  });

  it('treats a missing surface as arrival (legacy door default)', () => {
    assert.equal(photoStageForScanIntakeSurface(null), 'arrival_package');
    assert.equal(photoStageForScanIntakeSurface(undefined), 'arrival_package');
  });
});

describe('photo type predicates', () => {
  it('classifies package types including the legacy alias', () => {
    assert.equal(isPackagePhotoType(RECEIVING_PHOTO_PACKAGE), true);
    assert.equal(isPackagePhotoType(RECEIVING_PHOTO_LEGACY_PACKAGE), true);
    assert.equal(isPackagePhotoType(' Receiving_Package '), true);
    assert.equal(isPackagePhotoType(RECEIVING_PHOTO_UNBOX_CARTON), false);
    assert.equal(isPackagePhotoType(RECEIVING_PHOTO_ITEM), false);
    assert.equal(isPackagePhotoType(null), false);
  });

  it('classifies unbox carton and item types', () => {
    assert.equal(isUnboxCartonPhotoType(RECEIVING_PHOTO_UNBOX_CARTON), true);
    assert.equal(isUnboxCartonPhotoType(RECEIVING_PHOTO_PACKAGE), false);
    assert.equal(isItemPhotoType(RECEIVING_PHOTO_ITEM), true);
    assert.equal(isItemPhotoType(RECEIVING_PHOTO_PACKAGE), false);
  });

  it('carton-allowed set = package + unbox_carton + legacy, never item', () => {
    assert.equal(isCartonPhotoType(RECEIVING_PHOTO_PACKAGE), true);
    assert.equal(isCartonPhotoType(RECEIVING_PHOTO_UNBOX_CARTON), true);
    assert.equal(isCartonPhotoType(RECEIVING_PHOTO_LEGACY_PACKAGE), true);
    assert.equal(isCartonPhotoType(RECEIVING_PHOTO_ITEM), false);
    assert.equal(isCartonPhotoType(null), false);
  });
});

describe('receivingUploadStage (capture-queue write stage)', () => {
  it('defaults a carton shot to unbox_carton, NOT arrival_package', () => {
    // Regression: the mobile queue used to stamp every carton shot `receiving_package`, so `receiving_unbox_carton` had zero writers and a…
    assert.equal(receivingUploadStage(null), 'unbox_carton');
    assert.equal(receivingUploadStage(undefined), 'unbox_carton');
    assert.equal(
      receivingPhotoTypeForStage(receivingUploadStage(null)),
      RECEIVING_PHOTO_UNBOX_CARTON,
    );
  });

  it('honours an explicit arrival_package hint (door / triage bench)', () => {
    assert.equal(receivingUploadStage(null, 'arrival_package'), 'arrival_package');
    assert.equal(
      receivingPhotoTypeForStage(receivingUploadStage(null, 'arrival_package')),
      RECEIVING_PHOTO_PACKAGE,
    );
  });

  it('forces unbox_item for a line scope regardless of hint (identity law)', () => {
    assert.equal(receivingUploadStage(42), 'unbox_item');
    assert.equal(receivingUploadStage(42, 'arrival_package'), 'unbox_item');
    assert.equal(receivingUploadStage(42, 'unbox_carton'), 'unbox_item');
  });

  it('never resolves a carton scope to the line-only stage', () => {
    // `unbox_item` is illegal on a RECEIVING link, so the hint must not win.
    assert.equal(receivingUploadStage(null, 'unbox_item'), 'unbox_carton');
  });

  it('every resolved (entity, type) pair passes the write validator', () => {
    for (const lineId of [null, 7] as const) {
      for (const hint of [undefined, ...RECEIVING_PHOTO_STAGES] as const) {
        const stage = receivingUploadStage(lineId, hint);
        assert.equal(
          validateReceivingPhotoWrite({
            entityType: lineId != null ? 'RECEIVING_LINE' : 'RECEIVING',
            photoType: receivingPhotoTypeForStage(stage),
          }),
          null,
        );
      }
    }
  });
});

describe('stage ↔ type ↔ entity ↔ intent', () => {
  it('maps every stage to its canonical type, entity, and intent', () => {
    assert.deepEqual(RECEIVING_PHOTO_STAGES, ['arrival_package', 'unbox_carton', 'unbox_item']);

    assert.equal(receivingPhotoTypeForStage('arrival_package'), RECEIVING_PHOTO_PACKAGE);
    assert.equal(receivingPhotoTypeForStage('unbox_carton'), RECEIVING_PHOTO_UNBOX_CARTON);
    assert.equal(receivingPhotoTypeForStage('unbox_item'), RECEIVING_PHOTO_ITEM);

    assert.equal(receivingEntityTypeForStage('arrival_package'), 'RECEIVING');
    assert.equal(receivingEntityTypeForStage('unbox_carton'), 'RECEIVING');
    assert.equal(receivingEntityTypeForStage('unbox_item'), 'RECEIVING_LINE');

    assert.equal(photoIntentFromStage('arrival_package'), 'package');
    assert.equal(photoIntentFromStage('unbox_carton'), 'unbox_carton');
    assert.equal(photoIntentFromStage('unbox_item'), 'item');
  });

  it('derives stage from existing rows — entity wins for lines', () => {
    assert.equal(receivingStageFromPhotoType('RECEIVING', RECEIVING_PHOTO_PACKAGE), 'arrival_package');
    assert.equal(
      receivingStageFromPhotoType('RECEIVING', RECEIVING_PHOTO_LEGACY_PACKAGE),
      'arrival_package',
    );
    // Untyped legacy carton rows count as arrival evidence.
    assert.equal(receivingStageFromPhotoType('RECEIVING', null), 'arrival_package');
    assert.equal(receivingStageFromPhotoType('RECEIVING', ''), 'arrival_package');
    assert.equal(
      receivingStageFromPhotoType('RECEIVING', RECEIVING_PHOTO_UNBOX_CARTON),
      'unbox_carton',
    );
    // The pre-SoT desktop mis-stamp is unclassifiable — never package evidence.
    assert.equal(receivingStageFromPhotoType('RECEIVING', RECEIVING_PHOTO_ITEM), null);
    // Line evidence is item evidence regardless of stamp (identity law).
    assert.equal(receivingStageFromPhotoType('RECEIVING_LINE', RECEIVING_PHOTO_ITEM), 'unbox_item');
    assert.equal(
      receivingStageFromPhotoType('RECEIVING_LINE', RECEIVING_PHOTO_PACKAGE),
      'unbox_item',
    );
    assert.equal(receivingStageFromPhotoType('SERIAL_UNIT', 'testing_photo'), null);
  });
});

describe('validateReceivingPhotoWrite matrix', () => {
  const valid: Array<[string, string]> = [
    ['RECEIVING', RECEIVING_PHOTO_PACKAGE],
    ['RECEIVING', RECEIVING_PHOTO_UNBOX_CARTON],
    ['RECEIVING', RECEIVING_PHOTO_LEGACY_PACKAGE],
    ['RECEIVING_LINE', RECEIVING_PHOTO_ITEM],
  ];
  const invalid: Array<[string, string | null]> = [
    ['RECEIVING', RECEIVING_PHOTO_ITEM],
    ['RECEIVING', 'testing_photo'],
    ['RECEIVING', null],
    ['RECEIVING_LINE', RECEIVING_PHOTO_PACKAGE],
    ['RECEIVING_LINE', RECEIVING_PHOTO_UNBOX_CARTON],
    ['RECEIVING_LINE', RECEIVING_PHOTO_LEGACY_PACKAGE],
    ['RECEIVING_LINE', null],
  ];

  it('accepts every legal pair', () => {
    for (const [entityType, photoType] of valid) {
      assert.equal(validateReceivingPhotoWrite({ entityType, photoType }), null, `${entityType} × ${photoType}`);
    }
  });

  it('rejects every illegal pair with a message naming the allowed set', () => {
    for (const [entityType, photoType] of invalid) {
      const message = validateReceivingPhotoWrite({ entityType, photoType });
      assert.ok(message, `${entityType} × ${photoType} should be rejected`);
      assert.match(message, /allowed:/);
    }
  });

  it('ignores non-receiving entities', () => {
    assert.equal(validateReceivingPhotoWrite({ entityType: 'SERIAL_UNIT', photoType: 'anything' }), null);
    assert.equal(validateReceivingPhotoWrite({ entityType: 'SKU', photoType: null }), null);
  });

  it('assert form throws a typed error', () => {
    assert.throws(
      () => assertReceivingPhotoWrite({ entityType: 'RECEIVING', photoType: RECEIVING_PHOTO_ITEM }),
      (err: unknown) => err instanceof ReceivingPhotoWriteError,
    );
    assert.doesNotThrow(() =>
      assertReceivingPhotoWrite({ entityType: 'RECEIVING', photoType: RECEIVING_PHOTO_PACKAGE }),
    );
  });
});

describe('receivingPhotoIntentSql', () => {
  it('package pins carton entity AND package types (mis-stamps excluded)', () => {
    const sql = receivingPhotoIntentSql('package');
    assert.match(sql, /l\.entity_type = 'RECEIVING'/);
    assert.match(sql, /'receiving_package', 'receiving', ''/);
    assert.doesNotMatch(sql, /receiving_item/);
    assert.doesNotMatch(sql, / OR /);
  });

  it('unbox_carton pins carton entity AND the unbox type', () => {
    const sql = receivingPhotoIntentSql('unbox_carton');
    assert.match(sql, /l\.entity_type = 'RECEIVING'/);
    assert.match(sql, /'receiving_unbox_carton'/);
  });

  it('item is entity-only — no photo_type escape hatch', () => {
    const sql = receivingPhotoIntentSql('item');
    assert.match(sql, /l\.entity_type = 'RECEIVING_LINE'/);
    assert.doesNotMatch(sql, /photo_type/);
    assert.doesNotMatch(sql, / OR /);
  });

  it('all adds nothing', () => {
    assert.equal(receivingPhotoIntentSql('all'), '');
  });
});

describe('remapReceivingPhotoTypeOnMove', () => {
  it('keeps the stamp on same-entity moves', () => {
    assert.equal(
      remapReceivingPhotoTypeOnMove({
        fromEntityType: 'RECEIVING',
        toEntityType: 'RECEIVING',
        photoType: RECEIVING_PHOTO_UNBOX_CARTON,
      }),
      null,
    );
    assert.equal(
      remapReceivingPhotoTypeOnMove({
        fromEntityType: 'RECEIVING_LINE',
        toEntityType: 'RECEIVING_LINE',
        photoType: RECEIVING_PHOTO_ITEM,
      }),
      null,
    );
  });

  it('carton → line becomes item evidence', () => {
    for (const photoType of [RECEIVING_PHOTO_PACKAGE, RECEIVING_PHOTO_UNBOX_CARTON, RECEIVING_PHOTO_LEGACY_PACKAGE, null]) {
      assert.equal(
        remapReceivingPhotoTypeOnMove({
          fromEntityType: 'RECEIVING',
          toEntityType: 'RECEIVING_LINE',
          photoType,
        }),
        RECEIVING_PHOTO_ITEM,
      );
    }
  });

  it('line → carton falls back to package unless already carton-legal', () => {
    assert.equal(
      remapReceivingPhotoTypeOnMove({
        fromEntityType: 'RECEIVING_LINE',
        toEntityType: 'RECEIVING',
        photoType: RECEIVING_PHOTO_ITEM,
      }),
      RECEIVING_PHOTO_PACKAGE,
    );
    assert.equal(
      remapReceivingPhotoTypeOnMove({
        fromEntityType: 'RECEIVING_LINE',
        toEntityType: 'RECEIVING',
        photoType: RECEIVING_PHOTO_PACKAGE,
      }),
      null,
    );
  });
});

describe('remapReceivingPhotoTypeOnStageClaim', () => {
  it('promotes unbox_carton → arrival_package to receiving_package', () => {
    assert.equal(
      remapReceivingPhotoTypeOnStageClaim({
        fromStage: 'unbox_carton',
        toStage: 'arrival_package',
      }),
      RECEIVING_PHOTO_PACKAGE,
    );
  });

  it('same-stage arrival_package is a type no-op (null)', () => {
    assert.equal(
      remapReceivingPhotoTypeOnStageClaim({
        fromStage: 'arrival_package',
        toStage: 'arrival_package',
      }),
      null,
    );
  });

  it('refuses unclassifiable / item / reverse / unsupported targets', () => {
    assert.throws(
      () =>
        remapReceivingPhotoTypeOnStageClaim({
          fromStage: null,
          toStage: 'arrival_package',
        }),
      (err: unknown) => err instanceof ReceivingPhotoWriteError,
    );
    assert.throws(
      () =>
        remapReceivingPhotoTypeOnStageClaim({
          fromStage: 'unbox_item',
          toStage: 'arrival_package',
        }),
      (err: unknown) => err instanceof ReceivingPhotoWriteError,
    );
    assert.throws(
      () =>
        remapReceivingPhotoTypeOnStageClaim({
          fromStage: 'unbox_carton',
          toStage: 'unbox_item',
        }),
      (err: unknown) => err instanceof ReceivingPhotoWriteError,
    );
    assert.throws(
      () =>
        remapReceivingPhotoTypeOnStageClaim({
          fromStage: 'arrival_package',
          toStage: 'unbox_carton',
        }),
      (err: unknown) => err instanceof ReceivingPhotoWriteError,
    );
  });
});
