/**
 * Unit tests for the shared receiving photo scope helper — stage→target
 * mapping, lenient normalization (legacy queue entries / wire messages), and
 * phone-bridge request routing. Pure; runs DB-free under node:test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveReceivingPhotoStage,
  mobileCaptureHrefForRequest,
  normalizeReceivingPhotoRequest,
  parseReceivingCartonPhotoStage,
  parseReceivingPhotoStage,
  receivingPhotoListIntentForScope,
  resolveReceivingPhotoTarget,
} from './photo-scope';

test('parseReceivingPhotoStage accepts the three stages, rejects junk', () => {
  assert.equal(parseReceivingPhotoStage('arrival_package'), 'arrival_package');
  assert.equal(parseReceivingPhotoStage('unbox_carton'), 'unbox_carton');
  assert.equal(parseReceivingPhotoStage('unbox_item'), 'unbox_item');
  assert.equal(parseReceivingPhotoStage(' Unbox_Carton '), 'unbox_carton');
  assert.equal(parseReceivingPhotoStage('testing'), null);
  assert.equal(parseReceivingPhotoStage(''), null);
  assert.equal(parseReceivingPhotoStage(null), null);
  assert.equal(parseReceivingPhotoStage(undefined), null);
});

test('parseReceivingCartonPhotoStage defaults to arrival and coerces unbox_item', () => {
  assert.equal(parseReceivingCartonPhotoStage(null), 'arrival_package');
  assert.equal(parseReceivingCartonPhotoStage('garbage'), 'arrival_package');
  assert.equal(parseReceivingCartonPhotoStage('unbox_carton'), 'unbox_carton');
  // A carton surface can never hold item evidence — closest legal carton stage.
  assert.equal(parseReceivingCartonPhotoStage('unbox_item'), 'unbox_carton');
});

test('effectiveReceivingPhotoStage — entity wins, legacy defaults to arrival', () => {
  // Line id present → item evidence regardless of the claimed stage.
  assert.equal(effectiveReceivingPhotoStage({ receivingLineId: 5 }), 'unbox_item');
  assert.equal(
    effectiveReceivingPhotoStage({ stage: 'arrival_package', receivingLineId: 5 }),
    'unbox_item',
  );
  // No line id: carton stages pass through; unbox_item degrades to unbox_carton.
  assert.equal(effectiveReceivingPhotoStage({ stage: 'unbox_carton' }), 'unbox_carton');
  assert.equal(effectiveReceivingPhotoStage({ stage: 'unbox_item' }), 'unbox_carton');
  // Legacy scope (no stage at all) keeps the old package stamp.
  assert.equal(effectiveReceivingPhotoStage({}), 'arrival_package');
  assert.equal(effectiveReceivingPhotoStage({ stage: null, receivingLineId: null }), 'arrival_package');
});

test('resolveReceivingPhotoTarget maps each stage onto the write matrix', () => {
  assert.deepEqual(
    resolveReceivingPhotoTarget({ receivingId: 7, stage: 'arrival_package' }),
    { entityType: 'RECEIVING', entityId: 7, photoType: 'receiving_package' },
  );
  assert.deepEqual(
    resolveReceivingPhotoTarget({ receivingId: 7, receivingLineId: null, stage: 'unbox_carton' }),
    { entityType: 'RECEIVING', entityId: 7, photoType: 'receiving_unbox_carton' },
  );
  assert.deepEqual(
    resolveReceivingPhotoTarget({ receivingId: 7, receivingLineId: 41, stage: 'unbox_item' }),
    { entityType: 'RECEIVING_LINE', entityId: 41, photoType: 'receiving_item' },
  );
});

test('resolveReceivingPhotoTarget throws on incoherent scopes', () => {
  assert.throws(() => resolveReceivingPhotoTarget({ receivingId: 7, stage: 'unbox_item' }));
  assert.throws(() =>
    resolveReceivingPhotoTarget({ receivingId: 7, receivingLineId: 41, stage: 'unbox_carton' }),
  );
  assert.throws(() =>
    resolveReceivingPhotoTarget({ receivingId: 0, stage: 'arrival_package' }),
  );
});

test('receivingPhotoListIntentForScope matches the stage matrix', () => {
  assert.equal(receivingPhotoListIntentForScope({ stage: 'arrival_package' }), 'package');
  assert.equal(receivingPhotoListIntentForScope({ stage: 'unbox_carton' }), 'unbox_carton');
  assert.equal(receivingPhotoListIntentForScope({ stage: 'unbox_item', receivingLineId: 3 }), 'item');
  // Lenient path: line id alone is item intent.
  assert.equal(receivingPhotoListIntentForScope({ receivingLineId: 3 }), 'item');
});

test('normalizeReceivingPhotoRequest — legacy message without stage is arrival', () => {
  const req = normalizeReceivingPhotoRequest({
    receiving_id: 12,
    request_id: 'abc',
    requested_by_staff_id: 4,
  });
  assert.deepEqual(req, {
    receivingId: 12,
    receivingLineId: null,
    stage: 'arrival_package',
    poRef: null,
    requestId: 'abc',
  });
});

test('normalizeReceivingPhotoRequest — staged item request', () => {
  const req = normalizeReceivingPhotoRequest({
    receiving_id: '12',
    receiving_line_id: '77',
    stage: 'unbox_item',
    po_ref: '4421',
    request_id: 'r1',
  });
  assert.deepEqual(req, {
    receivingId: 12,
    receivingLineId: 77,
    stage: 'unbox_item',
    poRef: '4421',
    requestId: 'r1',
  });
});

test('normalizeReceivingPhotoRequest — invalid receiving id → null', () => {
  assert.equal(normalizeReceivingPhotoRequest({ receiving_id: 0 }), null);
  assert.equal(normalizeReceivingPhotoRequest({}), null);
  assert.equal(normalizeReceivingPhotoRequest(null), null);
});

test('mobileCaptureHrefForRequest routes carton stages to /m/r/{id}/photos', () => {
  assert.equal(
    mobileCaptureHrefForRequest({
      receivingId: 9,
      receivingLineId: null,
      stage: 'arrival_package',
      poRef: null,
      requestId: null,
    }),
    '/m/r/9/photos?stage=arrival_package',
  );
  assert.equal(
    mobileCaptureHrefForRequest({
      receivingId: 9,
      receivingLineId: null,
      stage: 'unbox_carton',
      poRef: '4421',
      requestId: 'rq1',
    }),
    '/m/r/9/photos?stage=unbox_carton&requestId=rq1',
  );
});

test('mobileCaptureHrefForRequest routes item stage to the PO item page', () => {
  assert.equal(
    mobileCaptureHrefForRequest({
      receivingId: 9,
      receivingLineId: 41,
      stage: 'unbox_item',
      poRef: 'PO 4421',
      requestId: 'rq2',
    }),
    '/m/receiving/po/PO%204421/item/41/photos?stage=unbox_item&requestId=rq2',
  );
});

test('mobileCaptureHrefForRequest — item without a PO degrades to the carton page', () => {
  assert.equal(
    mobileCaptureHrefForRequest({
      receivingId: 9,
      receivingLineId: 41,
      stage: 'unbox_item',
      poRef: null,
      requestId: null,
    }),
    '/m/r/9/photos?stage=unbox_carton',
  );
});
