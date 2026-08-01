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
  photoCount: 0,
  serialCount: 0,
  quantityExpected: 1,
};

const keys = (input: Parameters<typeof captureStepVocabulary>[0]) =>
  captureStepVocabulary(input).map((s) => s.key);

// ── Vocabulary is data, per intake type ──────────────────────────────────────

test('matched carton: the five-step procedure in order', () => {
  assert.deepEqual(keys(matched), [
    'po_photos',
    'packing_material',
    'item_photos',
    'condition',
    'serial',
  ]);
});

test('unfound carton prepends Classify (mirrors the unfound stepper)', () => {
  assert.deepEqual(keys({ ...matched, isUnfound: true })[0], 'classify');
  assert.equal(keys({ ...matched, isUnfound: true }).length, 6);
});

test('local pickup drops packing material — handed over, no carrier dunnage', () => {
  const k = keys({ ...matched, isLocalPickup: true });
  assert.ok(!k.includes('packing_material'));
  assert.ok(k.includes('po_photos'), 'arrival evidence still applies to a handover');
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

// ── Photo stage integrity (blocker B2) ───────────────────────────────────────

test('each photo step reads its OWN stage — the counts never pool', () => {
  const onlyArrival = deriveCaptureStepStates({ ...base, arrivalPhotoCount: 3 });
  assert.equal(onlyArrival.po_photos, 'done');
  assert.equal(onlyArrival.packing_material, 'active', 'a door shot must not satisfy the bench');
  assert.equal(onlyArrival.item_photos, 'pending');

  const onlyCarton = deriveCaptureStepStates({ ...base, unboxCartonPhotoCount: 2 });
  assert.equal(onlyCarton.po_photos, 'active', 'a bench shot must not satisfy the arrival gate');
  assert.equal(onlyCarton.packing_material, 'done');
});

test('packing material is folded onto unbox_carton, not its own stage', () => {
  const steps = captureStepVocabulary(matched);
  const packing = steps.find((s) => s.key === 'packing_material');
  assert.equal(packing?.stage, 'unbox_carton');
  // The only step bound to arrival is step 1 — nothing else may claim the stage
  // the receive gate counts.
  assert.deepEqual(
    steps.filter((s) => s.stage === 'arrival_package').map((s) => s.key),
    ['po_photos'],
  );
});

// ── Condition is not a gate ──────────────────────────────────────────────────

test('condition always reads done and the active pointer skips it', () => {
  const states = deriveCaptureStepStates({
    ...base,
    arrivalPhotoCount: 1,
    unboxCartonPhotoCount: 1,
    itemPhotoCount: 1,
  });
  assert.equal(states.condition, 'done');
  assert.equal(states.serial, 'active');
  assert.equal(activeCaptureStepKey({
    ...base,
    arrivalPhotoCount: 1,
    unboxCartonPhotoCount: 1,
    itemPhotoCount: 1,
  }), 'serial');
});

test('condition never holds the active marker, even on a fresh carton', () => {
  const flags = deriveCaptureStepFlags(base);
  assert.equal(flags.find((f) => f.key === 'condition')?.done, true);
  assert.equal(activeCaptureStepKey(base), 'po_photos');
});

// ── Serial gate is the shared one, not a second implementation ───────────────

test('serial reuses the matched gate: whole-line waiver completes it', () => {
  const states = deriveCaptureStepStates({
    ...base,
    arrivalPhotoCount: 1,
    unboxCartonPhotoCount: 1,
    itemPhotoCount: 1,
    serialAbsent: true,
  });
  assert.equal(states.serial, 'done');
});

test('serial on a multi-qty line needs every unit accounted for', () => {
  // Photo steps satisfied so the serial gate is the one under test — otherwise
  // po_photos legitimately holds `active` and serial reads `pending`.
  const shot = { ...base, arrivalPhotoCount: 1, unboxCartonPhotoCount: 1, itemPhotoCount: 1 };

  const partial = deriveCaptureStepStates({ ...shot, quantityExpected: 3, serialCount: 2 });
  assert.equal(partial.serial, 'active');

  const waived = deriveCaptureStepStates({
    ...shot,
    quantityExpected: 3,
    serialCount: 2,
    perUnitAbsentCount: 1,
  });
  assert.equal(waived.serial, 'done');
});

// ── Checklist, not a wizard ──────────────────────────────────────────────────

test('a later step whose gate passes reads done behind an incomplete earlier one', () => {
  const states = deriveCaptureStepStates({ ...base, serialCount: 1 });
  assert.equal(states.po_photos, 'active');
  assert.equal(states.serial, 'done', 'working out of order must not be reported as pending');
});

// ── Procedure list (every step renders, in order) ────────────────────────────

test('every step renders, in vocabulary order, whatever its state', () => {
  const steps = deriveProcedureSteps(base);
  assert.deepEqual(
    steps.map((s) => s.key),
    ['po_photos', 'packing_material', 'item_photos', 'condition', 'serial'],
    'a checklist shows the whole procedure — pending steps are the point',
  );
  assert.deepEqual(steps.map((s) => s.position), [1, 2, 3, 4, 5]);
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
  assert.equal(fresh[0].key, 'po_photos');

  const shot = deriveProcedureSteps({
    ...base,
    arrivalPhotoCount: 1,
    unboxCartonPhotoCount: 1,
    itemPhotoCount: 1,
  });
  assert.deepEqual(
    shot.filter((s) => s.state === 'active').map((s) => s.key),
    ['serial'],
    'condition is ungated, so the pointer steps over it',
  );
  assert.equal(shot.find((s) => s.key === 'condition')?.state, 'done');
});

test('an out-of-order completion reads done in place — no reordering', () => {
  const steps = deriveProcedureSteps({ ...base, serialCount: 1 });
  assert.equal(steps.find((s) => s.key === 'serial')?.state, 'done');
  assert.equal(steps.find((s) => s.key === 'po_photos')?.state, 'active');
  assert.equal(steps.at(-1)?.key, 'serial', 'order follows the vocabulary, not the state');
});

test('each photo step carries its own stage — packing material folds onto unbox_carton', () => {
  const byKey = new Map(deriveProcedureSteps(base).map((s) => [s.key, s.stage]));
  assert.equal(byKey.get('po_photos'), 'arrival_package');
  assert.equal(byKey.get('packing_material'), 'unbox_carton');
  assert.equal(byKey.get('item_photos'), 'unbox_item');
});

test('unfound: Classify holds active until it is answered', () => {
  const input = { ...base, vocabulary: { ...matched, isUnfound: true } };
  assert.equal(activeCaptureStepKey(input), 'classify');
  assert.equal(activeCaptureStepKey({ ...input, classified: true }), 'po_photos');
});
