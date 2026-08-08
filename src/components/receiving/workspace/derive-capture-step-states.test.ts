import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeCaptureStepKey,
  captureStepVocabulary,
  deriveCaptureStepFlags,
  deriveCaptureStepStates,
  deriveProcedureSteps,
  type DeriveCaptureStepStatesInput,
} from './derive-capture-step-states';

const matched = { isUnfound: false, isLocalPickup: false, isReturn: false };

const base: DeriveCaptureStepStatesInput = {
  vocabulary: matched,
  arrivalPhotoCount: 0,
  unboxCartonPhotoCount: 0,
  itemPhotoCount: 0,
  cartonAspectCounts: {},
  itemAspectCounts: {},
  requiredItemAspects: [],
  conditionGradedAt: null,
  contentsConfirmedAt: null,
  photoCount: 0,
  serialCount: 0,
  quantityExpected: 1,
};

/** Every carton shot present — the state the three aspect gates want. */
const cartonShot = {
  shipping_label: 1,
  box_exterior: 1,
  packing_material: 1,
} as const;

/** Everything before `serial` satisfied, so the serial gate is isolated. */
const upToSerial: DeriveCaptureStepStatesInput = {
  ...base,
  arrivalPhotoCount: 1,
  unboxCartonPhotoCount: 3,
  cartonAspectCounts: cartonShot,
  contentsConfirmedAt: '2026-08-01T10:00:00Z',
};

/**
 * Everything before `item_photos` satisfied (serial + condition included) so
 * the item-aspect gate is isolated. Capture trio order is Serial → Condition
 * → Photos.
 */
const upToItemPhotos: DeriveCaptureStepStatesInput = {
  ...upToSerial,
  serialCount: 1,
  conditionGradedAt: '2026-08-01T10:01:00Z',
  itemPhotoCount: 1,
};

const keys = (input: Parameters<typeof captureStepVocabulary>[0]) =>
  captureStepVocabulary(input).map((s) => s.key);

// ── Vocabulary is data, per intake type ──────────────────────────────────────

test('matched carton: the guided procedure in order', () => {
  assert.deepEqual(keys(matched), [
    'arrival_check',
    'shipping_label_photo',
    'box_photo',
    'packing_material',
    'contents',
    // Capture trio: Serial → Condition → Photos (FOUND_CAPTURE / Unbox dock).
    'serial',
    'condition',
    'item_photos',
    // `label` is a CAPTURE step — reading the face the carton is about to
    // print, the last correction that is still free. `print` stays a commit act
    // on the terminal dock.
    'label',
  ]);
});

test('unfound carton prepends Classify (mirrors the unfound stepper)', () => {
  const k = keys({ ...matched, isUnfound: true });
  assert.equal(k[0], 'classify');
  assert.equal(k.length, 10);
});

test('local pickup drops every carrier shot — handed over, no dunnage', () => {
  const k = keys({ ...matched, isLocalPickup: true });
  assert.ok(!k.includes('packing_material'));
  assert.ok(!k.includes('shipping_label_photo'), 'a handover has no carrier label');
  assert.ok(!k.includes('box_photo'), 'a handover has no shipping box');
  assert.ok(k.includes('arrival_check'), 'arrival evidence still applies to a handover');
  assert.ok(k.includes('contents'), 'someone still confirms what was handed over');
  assert.ok(k.includes('item_photos'));
});

test('return puts Serial before Condition — the scan names the unit being graded', () => {
  const k = keys({ ...matched, isReturn: true });
  assert.ok(k.indexOf('serial') < k.indexOf('condition'));
});

test('return + unfound compose: Classify first, serial still ahead of condition', () => {
  const k = keys({ isUnfound: true, isLocalPickup: false, isReturn: true });
  assert.equal(k[0], 'classify');
  assert.ok(k.indexOf('serial') < k.indexOf('condition'));
});

// ── Photo stage integrity (the receive-gate control) ─────────────────────────

test('each photo step reads its OWN stage — the counts never pool', () => {
  const onlyArrival = deriveCaptureStepStates({ ...base, arrivalPhotoCount: 3 });
  assert.equal(onlyArrival.arrival_check, 'done');
  assert.equal(
    onlyArrival.shipping_label_photo,
    'active',
    'a door shot must not satisfy a bench step',
  );
  assert.equal(onlyArrival.item_photos, 'pending');

  const onlyCarton = deriveCaptureStepStates({
    ...base,
    unboxCartonPhotoCount: 3,
    cartonAspectCounts: cartonShot,
  });
  assert.equal(
    onlyCarton.arrival_check,
    'active',
    'a bench shot must not satisfy the arrival gate',
  );
  assert.equal(onlyCarton.packing_material, 'done');
});

test('only step 1 is bound to the arrival stage the receive gate counts', () => {
  const steps = captureStepVocabulary(matched);
  assert.deepEqual(
    steps.filter((s) => s.stage === 'arrival_package').map((s) => s.key),
    ['arrival_check'],
  );
});

// ── Aspect, not stage, tells the three carton shots apart ────────────────────

test('the three carton steps share a stage and are gated by aspect alone', () => {
  const steps = captureStepVocabulary(matched);
  const carton = steps.filter((s) => s.stage === 'unbox_carton');
  assert.deepEqual(carton.map((s) => s.key), [
    'shipping_label_photo',
    'box_photo',
    'packing_material',
  ]);
  assert.deepEqual(carton.map((s) => s.aspect), [
    'shipping_label',
    'box_exterior',
    'packing_material',
  ]);
});

test('one carton shot cannot satisfy all three carton steps', () => {
  const states = deriveCaptureStepStates({
    ...base,
    arrivalPhotoCount: 1, // so the pointer is past step 1 and lands in the carton block
    // A stage count of 1 with only the label aspect present: gating on the
    // stage would mark the box and the dunnage done off one photo.
    unboxCartonPhotoCount: 1,
    cartonAspectCounts: { shipping_label: 1 },
  });
  assert.equal(states.shipping_label_photo, 'done');
  assert.equal(states.box_photo, 'active');
  assert.equal(states.packing_material, 'pending');
});

// ── Item aspects are ORG POLICY, not a constant ──────────────────────────────

test('with no required aspects, any item photo completes the step', () => {
  const states = deriveCaptureStepStates({ ...upToItemPhotos, requiredItemAspects: [] });
  assert.equal(states.item_photos, 'done', 'an empty policy must not read vacuously true either');

  const none = deriveCaptureStepStates({
    ...upToItemPhotos,
    itemPhotoCount: 0,
    requiredItemAspects: [],
  });
  assert.equal(none.item_photos, 'active', '[].every() is true — the fallback must not be skipped');
});

test('every required item aspect must have a shot', () => {
  const partial = deriveCaptureStepStates({
    ...upToItemPhotos,
    requiredItemAspects: ['included', 'serial'],
    itemAspectCounts: { included: 2 },
  });
  assert.equal(partial.item_photos, 'active', 'the serial shot is still missing');

  const complete = deriveCaptureStepStates({
    ...upToItemPhotos,
    requiredItemAspects: ['included', 'serial'],
    itemAspectCounts: { included: 2, serial: 1 },
  });
  assert.equal(complete.item_photos, 'done');
});

test('an optional aspect never blocks the step', () => {
  const states = deriveCaptureStepStates({
    ...upToItemPhotos,
    requiredItemAspects: ['included'],
    itemAspectCounts: { included: 1 },
  });
  assert.equal(states.item_photos, 'done', 'front/back/side/bottom are optional by default');
});

// ── Condition is a gate now, and the grade is not the gate ───────────────────

test('condition is gated on the grading ACT, not on the defaulted grade', () => {
  const ungraded = deriveCaptureStepStates({
    ...upToSerial,
    serialCount: 1,
    conditionGradedAt: null,
  });
  assert.equal(
    ungraded.condition,
    'active',
    'condition_grade is NOT NULL with a default — it can never be the gate',
  );
  assert.equal(
    deriveCaptureStepStates({ ...upToSerial, serialCount: 1, conditionGradedAt: '2026-08-01T10:01:00Z' })
      .condition,
    'done',
  );
});

test('condition can hold the active marker', () => {
  const flags = deriveCaptureStepFlags(base);
  assert.equal(flags.find((f) => f.key === 'condition')?.done, false);
  assert.equal(activeCaptureStepKey(base), 'arrival_check');
});

test('contents is gated on the confirmation stamp', () => {
  const before = deriveCaptureStepStates({
    ...base,
    arrivalPhotoCount: 1,
    unboxCartonPhotoCount: 3,
    cartonAspectCounts: cartonShot,
    contentsConfirmedAt: null,
  });
  assert.equal(before.contents, 'active');
  assert.equal(deriveCaptureStepStates(upToSerial).contents, 'done');
});

// ── Serial gate is the shared one, not a second implementation ───────────────

test('serial reuses the matched gate: whole-line waiver completes it', () => {
  const states = deriveCaptureStepStates({ ...upToSerial, serialAbsent: true });
  assert.equal(states.serial, 'done');
});

test('serial on a multi-qty line needs every unit accounted for', () => {
  const partial = deriveCaptureStepStates({
    ...upToSerial,
    quantityExpected: 3,
    serialCount: 2,
  });
  assert.equal(partial.serial, 'active');

  const waived = deriveCaptureStepStates({
    ...upToSerial,
    quantityExpected: 3,
    serialCount: 2,
    perUnitAbsentCount: 1,
  });
  assert.equal(waived.serial, 'done');
});

// ── Checklist, not a wizard ──────────────────────────────────────────────────

test('a later step whose gate passes reads done behind an incomplete earlier one', () => {
  const states = deriveCaptureStepStates({ ...base, serialCount: 1 });
  assert.equal(states.arrival_check, 'active');
  assert.equal(states.serial, 'done', 'working out of order must not be reported as pending');
});

// ── Procedure list (every step renders, in order) ────────────────────────────

test('every step renders, in vocabulary order, whatever its state', () => {
  const steps = deriveProcedureSteps(base);
  assert.deepEqual(
    steps.map((s) => s.key),
    [
      'arrival_check',
      'shipping_label_photo',
      'box_photo',
      'packing_material',
      'contents',
      'serial',
      'condition',
      'item_photos',
      'label',
    ],
    'a checklist shows the whole procedure — pending steps are the point',
  );
  assert.deepEqual(steps.map((s) => s.position), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('position is the vocabulary number and never renumbers', () => {
  const unfound = deriveProcedureSteps({ ...base, vocabulary: { ...matched, isUnfound: true } });
  assert.equal(unfound[0].key, 'classify');
  assert.equal(unfound[0].position, 1);
  assert.equal(unfound.at(-1)?.position, unfound.length);
});

test('exactly one step is active, and it is the first incomplete one', () => {
  const fresh = deriveProcedureSteps(base).filter((s) => s.state === 'active');
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].key, 'arrival_check');

  const shot = deriveProcedureSteps(upToSerial);
  assert.deepEqual(
    shot.filter((s) => s.state === 'active').map((s) => s.key),
    ['serial'],
  );
  // Condition sits after serial in the capture trio — still pending here.
  assert.equal(shot.find((s) => s.key === 'condition')?.state, 'pending');
});

test('an out-of-order completion reads done in place — no reordering', () => {
  const steps = deriveProcedureSteps({ ...base, serialCount: 1 });
  assert.equal(steps.find((s) => s.key === 'serial')?.state, 'done');
  assert.equal(steps.find((s) => s.key === 'arrival_check')?.state, 'active');
  assert.equal(steps.at(-1)?.key, 'label', 'order follows the vocabulary, not the state');
});

test('each photo step carries its own stage', () => {
  const byKey = new Map(deriveProcedureSteps(base).map((s) => [s.key, s.stage]));
  assert.equal(byKey.get('arrival_check'), 'arrival_package');
  assert.equal(byKey.get('shipping_label_photo'), 'unbox_carton');
  assert.equal(byKey.get('box_photo'), 'unbox_carton');
  assert.equal(byKey.get('packing_material'), 'unbox_carton');
  assert.equal(byKey.get('item_photos'), 'unbox_item');
  assert.equal(byKey.get('contents'), undefined, 'contents is not a photo step');
});

// ── Completion time (`at`) ───────────────────────────────────────────────────

test('a pending step carries no completion time, even holding real evidence', () => {
  // The subtle failure this exists for: one required item aspect of two is shot,
  // so the step legitimately holds evidence and is legitimately NOT done.
  // Printing that evidence's instant beside it reads as a completion.
  const partial = deriveProcedureSteps({
    ...base,
    requiredItemAspects: ['included', 'serial'],
    itemAspectCounts: { included: 1 },
    itemPhotoCount: 1,
    evidenceAt: { item_photos: '2026-08-01T10:00:00Z' },
  });
  const step = partial.find((s) => s.key === 'item_photos');
  assert.equal(step?.state, 'pending');
  assert.equal(step?.at, null, 'a pending step must never report a time');
});

test('an acknowledgement step takes its time from the column that gated it', () => {
  // condition / contents / label are the three steps whose gate IS an instant.
  // Reading it off the gate is what makes the time and the state impossible to
  // disagree — a caller cannot pass one and satisfy the other.
  const steps = deriveProcedureSteps({
    ...upToItemPhotos,
    labelPreviewedAt: '2026-08-01T10:02:00Z',
    // Ignored on purpose for these three.
    evidenceAt: { condition: '1999-01-01T00:00:00Z', label: '1999-01-01T00:00:00Z' },
  });
  const at = (key: string) => steps.find((s) => s.key === key)?.at;
  assert.equal(at('condition'), '2026-08-01T10:01:00Z');
  assert.equal(at('contents'), '2026-08-01T10:00:00Z');
  assert.equal(at('label'), '2026-08-01T10:02:00Z');
});

test('every other step takes the instant its caller resolved', () => {
  const steps = deriveProcedureSteps({
    ...upToSerial,
    evidenceAt: { arrival_check: '2026-08-01T09:00:00Z' },
  });
  assert.equal(steps.find((s) => s.key === 'arrival_check')?.at, '2026-08-01T09:00:00Z');
});

test('a done step whose caller resolved nothing reports null, never a fabricated time', () => {
  const steps = deriveProcedureSteps(upToSerial);
  const arrival = steps.find((s) => s.key === 'arrival_check');
  assert.equal(arrival?.state, 'done');
  assert.equal(arrival?.at, null, 'honest absence beats the nearest instant to hand');
});

test('unfound: Classify holds active until it is answered', () => {
  const input = { ...base, vocabulary: { ...matched, isUnfound: true } };
  assert.equal(activeCaptureStepKey(input), 'classify');
  assert.equal(activeCaptureStepKey({ ...input, classified: true }), 'arrival_check');
});
