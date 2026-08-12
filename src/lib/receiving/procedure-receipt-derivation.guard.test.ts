/**
 * Hard law: the receipt and the bench never disagree about whether a step is
 * done.
 *
 * The bench tells an operator "you still need to photograph the box"; the
 * receipt tells them "the box was photographed at 10:42". Those two surfaces
 * read the SAME carton, and being told two different things about the same box
 * is worse than either being wrong alone, because both look authoritative. That
 * is the failure `procedure-divergence.guard.test.ts` catches for the
 * bench↔Studio pair; this is the same law for the bench↔receipt pair.
 *
 * ## The comparison is deliberately TAUTOLOGICAL, and that is the point
 *
 * `buildProcedureReceipt` calls `deriveProcedureSteps` — the bench's own
 * function — rather than re-deriving the gates. So the two cannot disagree by
 * construction. What this guard defends is that construction:
 *
 *   1. The receipt must keep CALLING the shared derivation (structural check on
 *      the source, so a future rewrite that inlines the gates fails here).
 *   2. Evidence must never contradict state — a pending step shows no time.
 *   3. The commit steps the receipt adds must not leak onto the bench, and must
 *      themselves be honest.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/lib/receiving/procedure-receipt-derivation.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveProcedureSteps,
  type DeriveCaptureStepStatesInput,
} from '@/components/receiving/workspace/derive-capture-step-states';
import { buildProcedureReceipt, type StepEvidence } from './procedure-receipt';
import { getProcedure, registerBuiltinProcedures } from '@/lib/stations/procedure';

const RECEIPT_MODULE = join(
  fileURLToPath(new URL('../..', import.meta.url)),
  'lib/receiving/procedure-receipt.ts',
);

/** Comments stripped, so prose about the shared derivation can't satisfy a check. */
function receiptSource(): string {
  return readFileSync(RECEIPT_MODULE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

const matched = { isUnfound: false, isLocalPickup: false, isReturn: false };

const emptyGates: DeriveCaptureStepStatesInput = {
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

const workedGates: DeriveCaptureStepStatesInput = {
  ...emptyGates,
  arrivalPhotoCount: 2,
  arrivalAspectCounts: { shipping_label: 1, box_exterior: 1 },
  unboxCartonPhotoCount: 3,
  itemPhotoCount: 2,
  cartonAspectCounts: { shipping_label: 1, box_exterior: 1, packing_material: 1 },
  contentsConfirmedAt: '2026-08-01T10:00:00Z',
  conditionGradedAt: '2026-08-01T10:01:00Z',
  serialCount: 1,
  // The last CAPTURE step (2026-08-02): the operator read the face the carton
  // is about to print. Without it the bench pointer never leaves `label`, so a
  // fixture that means "every capture step is worked" has to carry it.
  labelPreviewedAt: '2026-08-01T10:02:00Z',
};

/**
 * The steps whose GATE is itself a timestamp column. Their `at` is resolved from
 * the gate input rather than from caller-supplied evidence, so they are the one
 * set that legitimately reports a time with an empty evidence map.
 */
const ACKNOWLEDGEMENT_STEPS = new Set(['condition', 'contents', 'label']);

/** Every carton shape the bench distinguishes, plus the pairs that co-occur. */
const SHAPES = [
  { name: 'matched', vocabulary: matched },
  { name: 'unfound', vocabulary: { ...matched, isUnfound: true } },
  { name: 'local pickup', vocabulary: { ...matched, isLocalPickup: true } },
  { name: 'return', vocabulary: { ...matched, isReturn: true } },
  { name: 'unfound return', vocabulary: { isUnfound: true, isLocalPickup: false, isReturn: true } },
  { name: 'pickup return', vocabulary: { isUnfound: false, isLocalPickup: true, isReturn: true } },
];

/** Evidence for every step, so a state/evidence mismatch has somewhere to show. */
const ALL_EVIDENCE: Record<string, StepEvidence> = Object.fromEntries(
  [
    'classify',
    'arrival_label_photo',
    'arrival_box_photo',
    'packing_material',
    'contents',
    'condition',
    'serial',
    'label',
    'print',
    'receive',
  ].map((key) => [
    key,
    { at: '2026-08-01T09:00:00Z', byStaffId: 4, byStaffName: 'Sam', detail: 'x' },
  ]),
);

test('the receipt resolves its states from the bench derivation, not its own', () => {
  const src = receiptSource();
  assert.match(
    src,
    /deriveProcedureSteps\s*\(/,
    'buildProcedureReceipt must call deriveProcedureSteps — the bench owns what "done" means',
  );
  assert.match(
    src,
    /from '@\/components\/receiving\/workspace\/derive-capture-step-states'/,
    'the receipt must import the bench gates directly',
  );
  // The shapes a re-derivation would take. Any of them means the receipt has
  // started answering "is this done" on its own.
  for (const forbidden of [/deriveCaptureStepFlags\s*\(/, /GATED_KEYS/, /switch\s*\(\s*step\.key/]) {
    assert.equal(
      forbidden.test(src),
      false,
      `the receipt re-derives step completion (${forbidden}) — that is the second answer this guard exists to prevent`,
    );
  }
});

test('the receipt reports exactly the bench states, on every carton shape', () => {
  for (const { name, vocabulary } of SHAPES) {
    for (const [label, gates] of [
      ['fresh', { ...emptyGates, vocabulary }],
      ['worked', { ...workedGates, vocabulary }],
    ] as const) {
      const bench = deriveProcedureSteps(gates);
      const receipt = buildProcedureReceipt({
        gates,
        evidence: ALL_EVIDENCE,
        labelPrintedAt: null,
        receivedAt: null,
      });
      const byKey = new Map(receipt.steps.map((s) => [s.key, s]));
      for (const step of bench) {
        assert.equal(
          byKey.get(step.key)?.state,
          step.state,
          `${name}/${label}: "${step.key}" — bench says ${step.state}, receipt says ${byKey.get(step.key)?.state}`,
        );
      }
      assert.deepEqual(
        receipt.steps
          .filter((s) => !['print', 'stage', 'receive'].includes(s.key))
          .map((s) => s.key),
        bench.map((s) => s.key),
        `${name}/${label}: the capture half of the receipt is the bench list, in order`,
      );
    }
  }
});

test('a step the bench calls pending carries NO completion time', () => {
  // The subtle failure: a step can hold real evidence and still be incomplete
  // (one required aspect of two). Printing that evidence's timestamp beside a
  // pending row reads as a completion.
  const receipt = buildProcedureReceipt({
    gates: emptyGates,
    evidence: ALL_EVIDENCE,
    labelPrintedAt: null,
    receivedAt: null,
  });
  for (const step of receipt.steps) {
    if (step.state === 'done') continue;
    assert.equal(step.at, null, `"${step.key}" is ${step.state} but reports a completion time`);
    assert.equal(step.byStaffId, null, `"${step.key}" is ${step.state} but names an actor`);
    assert.equal(step.capturedAt, null, `"${step.key}" is ${step.state} but reports a shutter time`);
  }
});

test('a done step with no recorded evidence reports no time — never a fabricated one', () => {
  const receipt = buildProcedureReceipt({
    gates: workedGates,
    evidence: {},
    labelPrintedAt: null,
    receivedAt: null,
  });
  const done = receipt.steps.filter((s) => s.state === 'done');
  assert.ok(done.length > 0, 'the worked fixture must complete something');
  for (const step of done) {
    // The three acknowledgement steps are exempt because for them there is no
    // external evidence to be missing: the GATE fact is itself an instant
    // (`condition_graded_at`, `contents_confirmed_at`, `label_previewed_at`),
    // so `stepCompletedAt` reads the very column that made the step done.
    // Reporting it is the opposite of fabricating one — a `condition` row that
    // said "done" with no time would be the receipt withholding a fact it holds.
    if (ACKNOWLEDGEMENT_STEPS.has(step.key)) {
      assert.notEqual(
        step.at,
        null,
        `"${step.key}" is gated on a timestamp column and must report it`,
      );
      continue;
    }
    assert.equal(step.at, null, `"${step.key}" invented a time it was never given`);
  }
});

test('an acknowledgement step reports its OWN gate instant, not a caller-supplied one', () => {
  // `evidenceAt` is ignored for these three on purpose. Two callers passing the
  // "same" instant twice is two chances to pass different ones, and the column
  // that decided `done` is the only defensible answer to "when".
  const receipt = buildProcedureReceipt({
    gates: {
      ...workedGates,
      evidenceAt: {
        condition: '1999-01-01T00:00:00Z',
        contents: '1999-01-01T00:00:00Z',
        label: '1999-01-01T00:00:00Z',
      },
    },
    evidence: {},
    labelPrintedAt: null,
    receivedAt: null,
  });
  const at = (key: string) => receipt.steps.find((s) => s.key === key)?.at;
  assert.equal(at('condition'), workedGates.conditionGradedAt);
  assert.equal(at('contents'), workedGates.contentsConfirmedAt);
  assert.equal(at('label'), workedGates.labelPreviewedAt);
});

test('a caller-resolved instant reaches the receipt for every OTHER done step', () => {
  const receipt = buildProcedureReceipt({
    gates: { ...workedGates, evidenceAt: { arrival_label_photo: '2026-08-01T09:30:00Z' } },
    evidence: {},
    labelPrintedAt: null,
    receivedAt: null,
  });
  const arrival = receipt.steps.find((s) => s.key === 'arrival_label_photo');
  assert.equal(arrival?.state, 'done');
  assert.equal(arrival?.at, '2026-08-01T09:30:00Z');
});

test('the commit steps are the receipt’s addition and never reach the capture derivation', () => {
  registerBuiltinProcedures();
  const unbox = getProcedure('unbox')!;
  const commitKeys = unbox.steps.filter((s) => s.phase === 'commit').map((s) => s.key);
  assert.deepEqual(commitKeys, ['print', 'stage', 'receive']);

  const benchKeys = new Set(deriveProcedureSteps(emptyGates).map((s) => s.key));
  for (const key of commitKeys) {
    assert.equal(
      benchKeys.has(key),
      false,
      `"${key}" is commit — not in deriveProcedureSteps (Print · Receive owns commit on the dogfood strip)`,
    );
  }

  const receipt = buildProcedureReceipt({
    gates: emptyGates,
    evidence: {},
    labelPrintedAt: null,
    stagedAt: null,
    receivedAt: null,
  });
  assert.deepEqual(receipt.steps.slice(-3).map((s) => s.key), commitKeys);
});

test('print, stage and receive are done only when their own fact exists', () => {
  const open = buildProcedureReceipt({
    gates: workedGates,
    evidence: {},
    labelPrintedAt: null,
    stagedAt: null,
    receivedAt: null,
  });
  assert.equal(open.steps.find((s) => s.key === 'print')?.state, 'active');
  assert.equal(open.steps.find((s) => s.key === 'stage')?.state, 'pending');
  assert.equal(open.steps.find((s) => s.key === 'receive')?.state, 'pending');
  assert.equal(open.closedAt, null, 'an unreceived carton is not closed');

  const staged = buildProcedureReceipt({
    gates: workedGates,
    evidence: {},
    labelPrintedAt: '2026-08-01T11:00:00Z',
    stagedAt: '2026-08-01T11:02:00Z',
    receivedAt: null,
  });
  assert.equal(staged.steps.find((s) => s.key === 'print')?.state, 'done');
  assert.equal(staged.steps.find((s) => s.key === 'stage')?.state, 'done');
  assert.equal(staged.steps.find((s) => s.key === 'receive')?.state, 'active');

  const closed = buildProcedureReceipt({
    gates: workedGates,
    evidence: {},
    labelPrintedAt: '2026-08-01T11:00:00Z',
    stagedAt: '2026-08-01T11:02:00Z',
    receivedAt: '2026-08-01T11:05:00Z',
  });
  assert.equal(closed.steps.find((s) => s.key === 'print')?.state, 'done');
  assert.equal(closed.steps.find((s) => s.key === 'print')?.at, '2026-08-01T11:00:00Z');
  assert.equal(closed.steps.find((s) => s.key === 'stage')?.state, 'done');
  assert.equal(closed.steps.find((s) => s.key === 'receive')?.state, 'done');
  assert.equal(closed.closedAt, '2026-08-01T11:05:00Z');
});

test('a receive with unfinished capture still reads done — a checklist, not a wizard', () => {
  // Same contract as every receiving stepper: a step is done when its OWN gate
  // passes. Reporting an out-of-order completion as pending would be the
  // receipt lying about work that demonstrably happened.
  const receipt = buildProcedureReceipt({
    gates: emptyGates,
    evidence: {},
    labelPrintedAt: null,
    receivedAt: '2026-08-01T11:05:00Z',
  });
  assert.equal(receipt.steps.find((s) => s.key === 'receive')?.state, 'done');
  assert.equal(receipt.steps.find((s) => s.key === 'arrival_label_photo')?.state, 'active');
});

test('exactly one step holds the active marker across the whole receipt', () => {
  for (const { name, vocabulary } of SHAPES) {
    const receipt = buildProcedureReceipt({
      gates: { ...emptyGates, vocabulary },
      evidence: {},
      labelPrintedAt: null,
      receivedAt: null,
    });
    const active = receipt.steps.filter((s) => s.state === 'active');
    assert.equal(active.length, 1, `${name}: ${active.length} active steps — ${active.map((s) => s.key)}`);
  }
});
