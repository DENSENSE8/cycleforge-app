import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  activeCaptureStepKey,
  captureStepVocabulary,
  deriveCaptureStepFlags,
  deriveCaptureStepStates,
  deriveCaptureStackRows,
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

// ── Stack row order (bottom-anchored: active is always last) ─────────────────

test('fresh carton: only the active step renders, nothing above it', () => {
  const rows = deriveCaptureStackRows(base);
  assert.deepEqual(rows.map((r) => r.key), ['po_photos']);
  assert.equal(rows[0].state, 'active');
});

test('an ungated step does not sit in the ledger before the pointer reaches it', () => {
  // Regression: Condition is `done` from first render (default grade), which
  // hoisted "Condition · NEW" above step 1 of a fresh carton — the ledger
  // claiming work that had not happened.
  assert.ok(!deriveCaptureStackRows(base).some((r) => r.key === 'condition'));

  // Once the pointer is past it, it IS history and belongs in the ledger.
  const past = deriveCaptureStackRows({
    ...base,
    arrivalPhotoCount: 1,
    unboxCartonPhotoCount: 1,
    itemPhotoCount: 1,
  });
  assert.equal(past.find((r) => r.key === 'condition')?.state, 'done');
  assert.equal(past[past.length - 1].key, 'serial');
});

test('row.position is the vocabulary step number, not the row index', () => {
  const rows = deriveCaptureStackRows({ ...base, vocabulary: { ...matched, isUnfound: true } });
  const classify = rows.find((r) => r.key === 'classify');
  assert.equal(classify?.position, 1, 'Classify is step 1 of the unfound vocabulary');

  // Out-of-order completion: hidden/absent rows must not renumber the steps.
  const outOfOrder = deriveCaptureStackRows({ ...base, serialCount: 1 });
  assert.equal(outOfOrder.find((r) => r.key === 'po_photos')?.position, 1);
  assert.equal(outOfOrder.find((r) => r.key === 'serial')?.position, 5);
});

test('the active step is last even when a later step already passed its gate', () => {
  // Serial captured before any photo — working out of order.
  const rows = deriveCaptureStackRows({ ...base, serialCount: 1 });
  const keys = rows.map((r) => r.key);
  assert.equal(rows[rows.length - 1].key, 'po_photos', 'next job stays next to the input');
  assert.ok(keys.includes('serial'), 'the out-of-order win still shows in the ledger');
  assert.equal(rows.find((r) => r.key === 'serial')?.state, 'done');
});

test('pending steps never render', () => {
  const keys = deriveCaptureStackRows(base).map((r) => r.key);
  assert.ok(!keys.includes('item_photos'), 'unreachable work must not push the active card up');
  assert.ok(!keys.includes('packing_material'));
});

test('completing a step moves it into the ledger and promotes the next', () => {
  const before = deriveCaptureStackRows(base);
  const after = deriveCaptureStackRows({ ...base, arrivalPhotoCount: 1 });
  assert.equal(before[before.length - 1].key, 'po_photos');
  assert.equal(after[after.length - 1].key, 'packing_material');
  assert.equal(after.find((r) => r.key === 'po_photos')?.state, 'done');
  assert.equal(after.length, before.length + 1);
});

test('finished carton: no active row, ledger only', () => {
  const rows = deriveCaptureStackRows({
    ...base,
    arrivalPhotoCount: 1,
    unboxCartonPhotoCount: 1,
    itemPhotoCount: 1,
    serialCount: 1,
  });
  assert.equal(rows.length, 5);
  assert.ok(rows.every((r) => r.state === 'done'));
});

test('unfound: Classify holds active until it is answered', () => {
  const input = { ...base, vocabulary: { ...matched, isUnfound: true } };
  assert.equal(activeCaptureStepKey(input), 'classify');
  assert.equal(activeCaptureStepKey({ ...input, classified: true }), 'po_photos');
});
