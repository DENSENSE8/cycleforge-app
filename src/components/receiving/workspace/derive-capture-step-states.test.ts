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
  arrivalAspectCounts: {},
  cartonAspectCounts: {},
  itemAspectCounts: {},
  requiredItemAspects: [],
  conditionGradedAt: null,
  contentsConfirmedAt: null,
  photoCount: 0,
  serialCount: 0,
  quantityExpected: 1,
};

/** Every door aspect present — the state the two door gates want. */
const doorShot = {
  shipping_label: 1,
  box_exterior: 1,
} as const;

/** Every carton shot present — the state the three aspect gates want. */
const cartonShot = {
  shipping_label: 1,
  box_exterior: 1,
  packing_material: 1,
} as const;

/** Everything before `serial` satisfied, so the serial gate is isolated. */
const upToSerial: DeriveCaptureStepStatesInput = {
  ...base,
  arrivalPhotoCount: 2,
  arrivalAspectCounts: doorShot,
  unboxCartonPhotoCount: 3,
  cartonAspectCounts: cartonShot,
  contentsConfirmedAt: '2026-08-01T10:00:00Z',
};

const keys = (input: Parameters<typeof captureStepVocabulary>[0]) =>
  captureStepVocabulary(input).map((s) => s.key);

// ── Vocabulary is data, per intake type ──────────────────────────────────────

test('matched carton: the guided procedure in order', () => {
  assert.deepEqual(keys(matched), [
    'arrival_label_photo',
    'arrival_box_photo',
    'packing_material',
    'contents',
    // Capture trio: Serial → Condition (door Label/Box own shipping + exterior).
    'serial',
    'condition',
    // `label` is a CAPTURE step — reading the face the carton is about to
    // print, the last correction that is still free. `print` stays a commit act
    // on the terminal dock.
    'label',
  ]);
});

test('unfound carton prepends Classify (mirrors the unfound stepper)', () => {
  const k = keys({ ...matched, isUnfound: true });
  assert.equal(k[0], 'classify');
  assert.equal(k.length, 8);
});

test('local pickup drops packing material — handed over, no dunnage', () => {
  const k = keys({ ...matched, isLocalPickup: true });
  assert.ok(!k.includes('packing_material'));
  assert.ok(!k.includes('shipping_label_photo'), 'bench Shipping label is off the walk');
  assert.ok(!k.includes('box_photo'), 'bench The box is off the walk');
  assert.ok(!k.includes('item_photos'), 'Item photos is off the walk');
  assert.ok(k.includes('arrival_label_photo'), 'door label still applies to a handover');
  assert.ok(k.includes('arrival_box_photo'), 'door box still applies to a handover');
  assert.ok(k.includes('contents'), 'someone still confirms what was handed over');
});

test('default found walk omits Shipping label, The box, and Item photos', () => {
  const k = keys(matched);
  assert.ok(!k.includes('shipping_label_photo'));
  assert.ok(!k.includes('box_photo'));
  assert.ok(!k.includes('item_photos'));
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
  const onlyArrival = deriveCaptureStepStates({
    ...base,
    arrivalPhotoCount: 2,
    arrivalAspectCounts: doorShot,
  });
  assert.equal(onlyArrival.arrival_label_photo, 'done');
  assert.equal(onlyArrival.arrival_box_photo, 'done');
  assert.equal(
    onlyArrival.packing_material,
    'active',
    'a door shot must not satisfy packing material',
  );

  const onlyCarton = deriveCaptureStepStates({
    ...base,
    unboxCartonPhotoCount: 3,
    cartonAspectCounts: cartonShot,
  });
  assert.equal(
    onlyCarton.arrival_label_photo,
    'active',
    'a bench shot must not satisfy the door label gate',
  );
  assert.equal(onlyCarton.packing_material, 'done');
});

test('door steps are bound to the arrival stage the receive gate counts', () => {
  const steps = captureStepVocabulary(matched);
  assert.deepEqual(
    steps.filter((s) => s.stage === 'arrival_package').map((s) => s.key),
    ['arrival_label_photo', 'arrival_box_photo'],
  );
});

// ── Aspect, not stage, tells carton packing material apart ───────────────────

test('the remaining carton step is packing_material on unbox_carton', () => {
  const steps = captureStepVocabulary(matched);
  const carton = steps.filter((s) => s.stage === 'unbox_carton');
  assert.deepEqual(carton.map((s) => s.key), ['packing_material']);
  assert.deepEqual(carton.map((s) => s.aspect), ['packing_material']);
});

test('packing material is gated by its aspect alone', () => {
  const states = deriveCaptureStepStates({
    ...base,
    arrivalPhotoCount: 2,
    arrivalAspectCounts: doorShot,
    unboxCartonPhotoCount: 1,
    cartonAspectCounts: { shipping_label: 1 },
  });
  assert.equal(states.packing_material, 'active');
  assert.equal(
    deriveCaptureStepStates({
      ...base,
      arrivalPhotoCount: 2,
      arrivalAspectCounts: doorShot,
      unboxCartonPhotoCount: 1,
      cartonAspectCounts: { packing_material: 1 },
    }).packing_material,
    'done',
  );
});

// ── Item photos are off the default walk ─────────────────────────────────────

test('item_photos is not on the default found capture walk', () => {
  const states = deriveCaptureStepStates({
    ...upToSerial,
    serialCount: 1,
    conditionGradedAt: '2026-08-01T10:01:00Z',
    itemPhotoCount: 1,
  });
  assert.equal(states.item_photos, undefined);
  assert.ok(!keys(matched).includes('item_photos'));
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
  assert.equal(activeCaptureStepKey(base), 'arrival_label_photo');
});

test('contents is gated on the confirmation stamp', () => {
  const before = deriveCaptureStepStates({
    ...base,
    arrivalPhotoCount: 2,
    arrivalAspectCounts: doorShot,
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
  assert.equal(states.arrival_label_photo, 'active');
  assert.equal(states.serial, 'done', 'working out of order must not be reported as pending');
});

// ── Procedure list (every step renders, in order) ────────────────────────────

test('every step renders, in vocabulary order, whatever its state', () => {
  const steps = deriveProcedureSteps(base);
  assert.deepEqual(
    steps.map((s) => s.key),
    [
      'arrival_label_photo',
      'arrival_box_photo',
      'packing_material',
      'contents',
      'serial',
      'condition',
      'label',
    ],
    'a checklist shows the whole procedure — pending steps are the point',
  );
  assert.deepEqual(steps.map((s) => s.position), [1, 2, 3, 4, 5, 6, 7]);
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
  assert.equal(fresh[0].key, 'arrival_label_photo');

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
  assert.equal(steps.find((s) => s.key === 'arrival_label_photo')?.state, 'active');
  assert.equal(steps.at(-1)?.key, 'label', 'order follows the vocabulary, not the state');
});

test('each photo step carries its own stage', () => {
  const byKey = new Map(deriveProcedureSteps(base).map((s) => [s.key, s.stage]));
  assert.equal(byKey.get('arrival_label_photo'), 'arrival_package');
  assert.equal(byKey.get('arrival_box_photo'), 'arrival_package');
  assert.equal(byKey.get('packing_material'), 'unbox_carton');
  assert.equal(byKey.get('contents'), undefined, 'contents is not a photo step');
  assert.equal(byKey.get('shipping_label_photo'), undefined);
  assert.equal(byKey.get('box_photo'), undefined);
  assert.equal(byKey.get('item_photos'), undefined);
});

// ── Completion time (`at`) ───────────────────────────────────────────────────

test('a pending step carries no completion time, even holding real evidence', () => {
  // Packing material with a wrong aspect present — evidence exists, step not done.
  const partial = deriveProcedureSteps({
    ...base,
    arrivalPhotoCount: 2,
    arrivalAspectCounts: doorShot,
    unboxCartonPhotoCount: 1,
    cartonAspectCounts: { shipping_label: 1 },
    evidenceAt: { packing_material: '2026-08-01T10:00:00Z' },
  });
  const step = partial.find((s) => s.key === 'packing_material');
  assert.equal(step?.state, 'active');
  assert.equal(step?.at, null, 'a pending step must never report a time');
});

test('an acknowledgement step takes its time from the column that gated it', () => {
  // condition / contents / label are the three steps whose gate IS an instant.
  // Reading it off the gate is what makes the time and the state impossible to
  // disagree — a caller cannot pass one and satisfy the other.
  const steps = deriveProcedureSteps({
    ...upToSerial,
    serialCount: 1,
    conditionGradedAt: '2026-08-01T10:01:00Z',
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
    evidenceAt: { arrival_label_photo: '2026-08-01T09:00:00Z' },
  });
  assert.equal(steps.find((s) => s.key === 'arrival_label_photo')?.at, '2026-08-01T09:00:00Z');
});

test('a done step whose caller resolved nothing reports null, never a fabricated time', () => {
  const steps = deriveProcedureSteps(upToSerial);
  const arrival = steps.find((s) => s.key === 'arrival_label_photo');
  assert.equal(arrival?.state, 'done');
  assert.equal(arrival?.at, null, 'honest absence beats the nearest instant to hand');
});

test('unfound: Classify holds active until it is answered', () => {
  const input = { ...base, vocabulary: { ...matched, isUnfound: true } };
  assert.equal(activeCaptureStepKey(input), 'classify');
  assert.equal(activeCaptureStepKey({ ...input, classified: true }), 'arrival_label_photo');
});
