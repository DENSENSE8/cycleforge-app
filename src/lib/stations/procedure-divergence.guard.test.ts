/**
 * Hard law: a station's step sequence is declared in exactly ONE place.
 *
 * Two surfaces render a station's steps — the Studio Procedure lens (owner:
 * "what should happen here") and the bench checklist (operator: "where am I").
 * They were authored independently, hours apart, in different lanes, and by the
 * time anyone noticed there were FOUR step vocabularies for Unbox alone:
 *
 *   derive-receiving-step-states   photos · serial · print          (3-dot bar)
 *   derive-unfound-step-states     unfound variant
 *   derive-capture-step-states     the bench checklist              (5–6 steps)
 *   stations/procedure.ts          the Studio declaration           (7 steps)
 *
 * Two of those claimed IN THEIR OWN DOCBLOCKS to be "the operator-facing unbox
 * procedure", and they disagreed. An operator being taught one procedure at the
 * bench while the owner reads a different one in Studio is worse than either
 * being wrong alone, because both look authoritative.
 *
 * ## The merge happened — this guard changed shape with it
 *
 * An earlier version of this file compared the two sequences across every carton
 * shape and asserted they matched. That comparison is now TAUTOLOGICAL:
 * `captureStepVocabulary` resolves from `resolveProcedureSteps(..., 'capture')`,
 * so the bench and the lens read the same declaration and cannot disagree about
 * order, labels, photo stages or variant rules. (The comparison did its job
 * first: it proved the two produced identical sequences BEFORE the swap, which
 * is what made the swap a provably behaviour-preserving refactor rather than a
 * rewrite.)
 *
 * What remains is the pair of invariants that keep it that way:
 *
 *   1. The bench must not grow a second vocabulary. Re-introducing a local
 *      ordered step array is exactly how the four-way split happened.
 *   2. Every declared `capture` step must have a GATE at the bench. The
 *      declaration owns the sequence; the bench owns "what counts as done",
 *      because a gate needs the live row and the declaration is fetch-free.
 *      A declared step with no gate renders permanently unchecked and blocks
 *      the operator, so it fails here instead of at the bench.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/lib/stations/procedure-divergence.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureStepVocabulary } from '@/components/receiving/workspace/derive-capture-step-states';
import { getProcedure, resolveProcedureSteps, type ProcedureVariant } from './procedure';
import { registerStationBuiltins } from './index';

registerStationBuiltins();

const BENCH_MODULE = join(
  fileURLToPath(new URL('../..', import.meta.url)),
  'components/receiving/workspace/derive-capture-step-states.ts',
);

/** Comments stripped, so prose about a vocabulary can never satisfy a check. */
function benchSource(): string {
  return readFileSync(BENCH_MODULE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

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

test('the bench resolves its vocabulary from the station declaration', () => {
  const src = benchSource();
  assert.match(
    src,
    /resolveProcedureSteps\s*\(/,
    'derive-capture-step-states must call resolveProcedureSteps — the declaration owns the sequence',
  );
  assert.match(
    src,
    /from '@\/lib\/stations\/procedure'/,
    'the bench must import the station procedure declaration directly',
  );
});

test('the bench declares no second ordered vocabulary', () => {
  const src = benchSource();
  // The exact shape that forked before: a module-level array of step objects.
  const localVocabulary = /(?:const|let)\s+\w*(?:STEPS|VOCAB\w*)\s*(?::[^=]+)?=\s*\[/i;
  assert.equal(
    localVocabulary.test(src),
    false,
    'a local ordered step array is back in derive-capture-step-states — that is exactly how ' +
      'the four-way vocabulary split happened. Declare the step in stations/procedure.ts and ' +
      'let this module resolve it.',
  );
});

test('every declared capture step has a gate at the bench', () => {
  const unbox = getProcedure('unbox');
  assert.ok(unbox, 'the unbox procedure must be registered');
  const src = benchSource();
  const gated = src.slice(src.indexOf('GATED_KEYS'), src.indexOf('function isCaptureStepKey'));
  for (const step of unbox.steps.filter((s) => s.phase === 'capture')) {
    assert.ok(
      gated.includes(`${step.key}:`),
      `capture step "${step.key}" is declared but has no gate in GATED_KEYS — it would render ` +
        `permanently unchecked and block the operator. Add its gate to deriveCaptureStepFlags.`,
    );
  }
});

test('the bench renders the capture phase and nothing else', () => {
  const unbox = getProcedure('unbox')!;
  const offBench = unbox.steps.filter((s) => s.phase !== 'capture').map((s) => s.key);
  assert.ok(offBench.includes('scan'), 'scan is intake — it precedes the checklist');
  assert.ok(offBench.includes('print'), 'print is commit — the terminal dock owns it');
  assert.ok(offBench.includes('receive'), 'receive is commit — the terminal dock owns it');
  for (const { name, variant } of SHAPES) {
    const rendered = new Set(captureStepVocabulary(variant).map((s) => s.key));
    for (const key of offBench) {
      assert.equal(
        rendered.has(key),
        false,
        `${name}: "${key}" is declared off-bench but the checklist renders it`,
      );
    }
  }
});

test('every carton shape still resolves a usable sequence', () => {
  // Not a comparison any more — a smoke test that the variant rules compose.
  // `pickup return` exercises an omission and a reorder at once, which is where
  // a naive filter-then-splice implementation breaks.
  const unbox = getProcedure('unbox')!;
  for (const { name, variant } of SHAPES) {
    const keys = resolveProcedureSteps(unbox, variant, 'capture').map((s) => s.key);
    assert.ok(keys.length > 0, `${name}: resolved an empty procedure`);
    assert.equal(new Set(keys).size, keys.length, `${name}: a step is duplicated — ${keys.join(' → ')}`);
    assert.equal(
      keys.includes('packing_material'),
      !variant.isLocalPickup,
      `${name}: packing_material should be present iff this is not a local pickup`,
    );
    assert.equal(keys.includes('classify'), variant.isUnfound, `${name}: classify is unfound-only`);
    if (variant.isReturn) {
      assert.ok(
        keys.indexOf('serial') < keys.indexOf('condition'),
        `${name}: a return captures the serial before the grade — ${keys.join(' → ')}`,
      );
    }
  }
});
