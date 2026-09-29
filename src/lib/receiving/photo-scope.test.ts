/**
 * Unit tests for the shared receiving photo scope helper — stage→target
 * mapping, lenient normalization (legacy queue entries / wire messages), and
 * phone-bridge request routing. Pure; runs DB-free under node:test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveReceivingPhotoStage,
  mobileArrivalGuidedPhotosHref,
  mobileCaptureHrefForRequest,
  mobileUnboxPhotoReturnHref,
  normalizeReceivingPhotoRequest,
  parseArrivalGuidedStep,
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

test('parseReceivingCartonPhotoStage defaults to unbox_carton and coerces unbox_item', () => {
  // Missing/unknown stage must default to the SAFE stage (unbox_carton), never
  // arrival_package — a stage-less mobile capture is far more likely to be a
  // bench shot than a door shot. Arrival must always be requested explicitly.
  assert.equal(parseReceivingCartonPhotoStage(null), 'unbox_carton');
  assert.equal(parseReceivingCartonPhotoStage('garbage'), 'unbox_carton');
  assert.equal(parseReceivingCartonPhotoStage('unbox_carton'), 'unbox_carton');
  // A carton surface can never hold item evidence — closest legal carton stage.
  assert.equal(parseReceivingCartonPhotoStage('unbox_item'), 'unbox_carton');
});

test('effectiveReceivingPhotoStage — entity wins, missing stage defaults safely', () => {
  // Line id present → item evidence regardless of the claimed stage.
  assert.equal(effectiveReceivingPhotoStage({ receivingLineId: 5 }), 'unbox_item');
  assert.equal(
    effectiveReceivingPhotoStage({ stage: 'arrival_package', receivingLineId: 5 }),
    'unbox_item',
  );
  // No line id: carton stages pass through; unbox_item degrades to unbox_carton.
  assert.equal(effectiveReceivingPhotoStage({ stage: 'unbox_carton' }), 'unbox_carton');
  assert.equal(effectiveReceivingPhotoStage({ stage: 'unbox_item' }), 'unbox_carton');
  // A scope with no stage at all must default to unbox_carton, never
  // arrival_package (the safety-classification-defaulted bug this guards).
  assert.equal(effectiveReceivingPhotoStage({}), 'unbox_carton');
  assert.equal(effectiveReceivingPhotoStage({ stage: null, receivingLineId: null }), 'unbox_carton');
});

test('resolveReceivingPhotoTarget maps each stage onto the write matrix', () => {
  assert.deepEqual(
    resolveReceivingPhotoTarget({ receivingId: 7, stage: 'arrival_package' }),
    { entityType: 'RECEIVING', entityId: 7, photoType: 'receiving_package', aspect: null },
  );
  assert.deepEqual(
    resolveReceivingPhotoTarget({ receivingId: 7, receivingLineId: null, stage: 'unbox_carton' }),
    { entityType: 'RECEIVING', entityId: 7, photoType: 'receiving_unbox_carton', aspect: null },
  );
  assert.deepEqual(
    resolveReceivingPhotoTarget({ receivingId: 7, receivingLineId: 41, stage: 'unbox_item' }),
    { entityType: 'RECEIVING_LINE', entityId: 41, photoType: 'receiving_item', aspect: null },
  );
});

test('an omitted aspect is null — unclassified evidence, never inferred', () => {
  // The resolver knows the stage, so it COULD guess a "most likely" aspect.
  // It must not: an aspect is a claim about what the photo shows, and this
  // module is not in a position to make one on the operator's behalf.
  const target = resolveReceivingPhotoTarget({ receivingId: 7, stage: 'unbox_carton' });
  assert.equal(target.aspect, null);
});

test('a declared aspect rides through to the write target', () => {
  assert.equal(
    resolveReceivingPhotoTarget({
      receivingId: 7,
      stage: 'unbox_carton',
      aspect: 'packing_material',
    }).aspect,
    'packing_material',
  );
  assert.equal(
    resolveReceivingPhotoTarget({
      receivingId: 7,
      receivingLineId: 41,
      stage: 'unbox_item',
      aspect: 'serial',
    }).aspect,
    'serial',
  );
});

test('an aspect illegal for the stage throws — this is the STRICT resolver', () => {
  // `packing_material` describes the inside of an opened box, so it can never
  // be arrival (pre-opening) evidence. Failing here means a mis-wired capture
  // surface breaks in dev and tests, not with a 400 at the bench.
  assert.throws(
    () =>
      resolveReceivingPhotoTarget({
        receivingId: 7,
        stage: 'arrival_package',
        aspect: 'packing_material',
      }),
    /not legal at the arrival_package stage/,
  );
  assert.throws(() =>
    resolveReceivingPhotoTarget({
      receivingId: 7,
      receivingLineId: 41,
      stage: 'unbox_item',
      aspect: 'shipping_label',
    }),
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

test('normalizeReceivingPhotoRequest — message without stage defaults to unbox_carton', () => {
  const req = normalizeReceivingPhotoRequest({
    receiving_id: 12,
    request_id: 'abc',
    requested_by_staff_id: 4,
  });
  assert.deepEqual(req, {
    receivingId: 12,
    receivingLineId: null,
    stage: 'unbox_carton',
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
    '/m/r/9/photos?stage=arrival_package&guided=1&back=%2Fm%2Fscan%3Frid%3D9%26step%3Dplatform',
  );
  assert.equal(
    mobileCaptureHrefForRequest({
      receivingId: 9,
      receivingLineId: null,
      stage: 'unbox_carton',
      poRef: '4421',
      requestId: 'rq1',
    }),
    '/m/r/9/photos?stage=unbox_carton&requestId=rq1&back=%2Fm%2Freceiving',
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
    '/m/receiving/po/PO%204421/item/41/photos?stage=unbox_item&requestId=rq2&back=%2Fm%2Freceiving',
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
    '/m/r/9/photos?stage=unbox_carton&back=%2Fm%2Freceiving',
  );
});

test('mobileUnboxPhotoReturnHref never implicitly opens carton rows', () => {
  assert.equal(mobileUnboxPhotoReturnHref(null), '/m/receiving');
  assert.equal(mobileUnboxPhotoReturnHref('  '), '/m/receiving');
  assert.equal(mobileUnboxPhotoReturnHref('/m/r/9'), '/m/r/9');
});

test('mobileArrivalGuidedPhotosHref always stamps arrival_package + guided', () => {
  assert.equal(
    mobileArrivalGuidedPhotosHref(42, { back: '/m/scan', title: '1Z999' }),
    '/m/r/42/photos?stage=arrival_package&guided=1&back=%2Fm%2Fscan&title=1Z999',
  );
  assert.equal(
    mobileArrivalGuidedPhotosHref(7),
    '/m/r/7/photos?stage=arrival_package&guided=1',
  );
});

test('parseArrivalGuidedStep accepts box_exterior and defaults to shipping_label', () => {
  assert.equal(parseArrivalGuidedStep('box_exterior'), 'box_exterior');
  assert.equal(parseArrivalGuidedStep('BOX_EXTERIOR'), 'box_exterior');
  assert.equal(parseArrivalGuidedStep('shipping_label'), 'shipping_label');
  assert.equal(parseArrivalGuidedStep(null), 'shipping_label');
  assert.equal(parseArrivalGuidedStep('packing_material'), 'shipping_label');
});
