/**
 * Hard law: the station bench and the Studio declaration describe ONE procedure.
 *
 * Two surfaces render a station's steps — the Studio Procedure lens (owner:
 * "what should happen here") and the right-rail checklist at the bench
 * (operator: "where am I"). They were authored independently, hours apart, in
 * different lanes, and by the time anyone noticed there were FOUR step
 * vocabularies for Unbox alone:
 *
 *   derive-receiving-step-states   photos · serial · print          (3-dot bar)
 *   derive-unfound-step-states     unfound variant
 *   derive-capture-step-states     the bench checklist              (5–6 steps)
 *   stations/procedure.ts          the Studio declaration           (7 steps)
 *
 * Two of those claim IN THEIR OWN DOCBLOCKS to be "the operator-facing unbox
 * procedure", and they disagreed. That is the failure this guard exists to make
 * impossible: an operator being taught one procedure at the bench while the
 * owner reads a different one in Studio is worse than either being wrong alone,
 * because both look authoritative.
 *
 * ## What is compared
 *
 * For every carton shape (and the combinations that co-occur), the bench's
 * `captureStepVocabulary` must produce EXACTLY the key sequence that
 * `resolveProcedureSteps(..., phase: 'capture')` produces — same keys, same
 * order. Only the `capture` phase: `intake` (scan) has already happened by the
 * time the checklist renders, and `commit` (print · receive) is the terminal
 * dock's job. That phase split IS the reconciliation.
 *
 * ## Direction of travel
 *
 * This guard pins the two in sync; it is not the end state. The end state is the
 * bench importing `resolveProcedureSteps` and `captureStepVocabulary` being
 * deleted, at which point this file becomes trivially true and should be removed
 * with it. Until then it is the seam that stops them drifting apart again.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/lib/stations/procedure-divergence.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { captureStepVocabulary } from '@/components/receiving/workspace/derive-capture-step-states';
import { getProcedure, resolveProcedureSteps, type ProcedureVariant } from './procedure';
import { registerStationBuiltins } from './index';

registerStationBuiltins();

/**
 * Every carton shape the bench distinguishes, plus the combinations that really
 * co-occur. An unfound return is a normal Tuesday: a customer sends something
 * back with no RMA on the box.
 */
const SHAPES: ReadonlyArray<{ name: string; variant: Required<ProcedureVariant> }> = [
  { name: 'matched', variant: { isUnfound: false, isLocalPickup: false, isReturn: false } },
  { name: 'unfound', variant: { isUnfound: true, isLocalPickup: false, isReturn: false } },
  { name: 'local pickup', variant: { isUnfound: false, isLocalPickup: true, isReturn: false } },
  { name: 'return', variant: { isUnfound: false, isLocalPickup: false, isReturn: true } },
  { name: 'unfound return', variant: { isUnfound: true, isLocalPickup: false, isReturn: true } },
  { name: 'pickup return', variant: { isUnfound: false, isLocalPickup: true, isReturn: true } },
];

function benchKeys(variant: Required<ProcedureVariant>): string[] {
  return captureStepVocabulary(variant).map((s) => s.key);
}

function declaredKeys(variant: Required<ProcedureVariant>): string[] {
  const unbox = getProcedure('unbox');
  assert.ok(unbox, 'the unbox procedure must be registered');
  return resolveProcedureSteps(unbox, variant, 'capture').map((s) => s.key);
}

test('the bench checklist and the Studio declaration agree on every carton shape', () => {
  for (const { name, variant } of SHAPES) {
    assert.deepEqual(
      benchKeys(variant),
      declaredKeys(variant),
      `${name}: the bench renders [${benchKeys(variant).join(' → ')}] but the declaration says ` +
        `[${declaredKeys(variant).join(' → ')}]. One procedure, two surfaces — change ` +
        `stations/procedure.ts and let the bench resolve from it, never patch one side.`,
    );
  }
});

test('the capture phase is the whole checklist and nothing else', () => {
  const unbox = getProcedure('unbox')!;
  // A step the bench renders must be declared `capture`. If a new bench step
  // shows up as `intake` or `commit`, the phase split has been mis-assigned and
  // the two surfaces will silently disagree about who renders it.
  const captureKeys = new Set(unbox.steps.filter((s) => s.phase === 'capture').map((s) => s.key));
  for (const { name, variant } of SHAPES) {
    for (const key of benchKeys(variant)) {
      assert.ok(
        captureKeys.has(key),
        `${name}: the bench renders "${key}", which the declaration does not mark phase:'capture'`,
      );
    }
  }
});

test('intake and commit steps never leak into the bench checklist', () => {
  const unbox = getProcedure('unbox')!;
  const offBench = unbox.steps
    .filter((s) => s.phase !== 'capture')
    .map((s) => s.key);
  assert.ok(offBench.includes('scan'), 'scan is intake — it precedes the checklist');
  assert.ok(offBench.includes('print'), 'print is commit — the terminal dock owns it');
  assert.ok(offBench.includes('receive'), 'receive is commit — the terminal dock owns it');
  for (const { name, variant } of SHAPES) {
    const rendered = new Set(benchKeys(variant));
    for (const key of offBench) {
      assert.equal(
        rendered.has(key),
        false,
        `${name}: "${key}" is declared off-bench but the checklist renders it`,
      );
    }
  }
});

test('the declared gate hints match the bench definitions', () => {
  // `ungated` and `perUnit` change what the operator sees (a skipped pointer, an
  // `n of N` counter), so a mismatch is a visible lie on one surface or the other.
  const unbox = getProcedure('unbox')!;
  const declared = new Map(unbox.steps.map((s) => [s.key, s]));
  for (const step of captureStepVocabulary(SHAPES[0].variant)) {
    const mine = declared.get(step.key);
    assert.ok(mine, `bench step "${step.key}" is undeclared`);
    assert.equal(
      mine.ungated ?? false,
      step.ungated ?? false,
      `"${step.key}": ungated disagrees (declaration ${mine.ungated ?? false} / bench ${step.ungated ?? false})`,
    );
    assert.equal(
      mine.perUnit ?? false,
      step.perUnit ?? false,
      `"${step.key}": perUnit disagrees (declaration ${mine.perUnit ?? false} / bench ${step.perUnit ?? false})`,
    );
  }
});

test('a photo step names the same receiving stage on both sides', () => {
  // The stage is a real control, not a label: `po_photos` reads
  // `arrival_package` (the door's pre-opening shot) and the receive gate counts
  // only that stage. A bench capture stamped there would satisfy the gate with a
  // post-opening image and void it.
  const unbox = getProcedure('unbox')!;
  const declared = new Map(unbox.steps.map((s) => [s.key, s]));
  for (const step of captureStepVocabulary(SHAPES[0].variant)) {
    if (!step.stage) continue;
    assert.equal(
      declared.get(step.key)?.photoStage,
      step.stage,
      `"${step.key}": photo stage disagrees — the receive gate counts stages, so this is a control, not a label`,
    );
  }
});
