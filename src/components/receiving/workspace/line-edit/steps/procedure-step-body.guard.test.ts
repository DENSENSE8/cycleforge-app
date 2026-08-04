/**
 * Hard law: every declared capture step has a body to render.
 *
 * Sibling of `procedure-divergence.guard.test.ts`, which pins the other half of
 * the same contract — that every declared step has a GATE. Together they close
 * the loop: the declaration owns the sequence, the bench owns "what counts as
 * done", and this owns "what the operator actually sees when they get there".
 *
 * ## Why this must fail in CI rather than at the bench
 *
 * The step vocabulary is resolved per carton VARIANT. An unfound carton gains
 * `classify`; a local pickup drops the three dunnage shots; a return moves
 * `serial` before `condition`. So a body added for the shape the author happened
 * to be testing can be missing for a shape that only appears on a real Tuesday —
 * and the failure mode is an expanded step card with nothing in it, mid-carton,
 * with the operator's hands full. A registry lookup miss is a static question;
 * this asks it for every shape.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/receiving/workspace/line-edit/steps/procedure-step-body.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProcedure,
  registerBuiltinProcedures,
  resolveProcedureSteps,
  type ProcedureVariant,
} from '@/lib/stations/procedure';
import { UNBOX_STEP_BODIES } from './index';

registerBuiltinProcedures();

/**
 * Every carton shape the bench distinguishes, plus the combinations that really
 * co-occur — mirrors `procedure-divergence.guard.test.ts` on purpose, so a new
 * variant has to be added to both and cannot be covered by only one.
 */
const SHAPES: ReadonlyArray<{ name: string; variant: Required<ProcedureVariant> }> = [
  { name: 'matched', variant: { isUnfound: false, isLocalPickup: false, isReturn: false } },
  { name: 'unfound', variant: { isUnfound: true, isLocalPickup: false, isReturn: false } },
  { name: 'local pickup', variant: { isUnfound: false, isLocalPickup: true, isReturn: false } },
  { name: 'return', variant: { isUnfound: false, isLocalPickup: false, isReturn: true } },
  { name: 'unfound return', variant: { isUnfound: true, isLocalPickup: false, isReturn: true } },
  { name: 'pickup return', variant: { isUnfound: false, isLocalPickup: true, isReturn: true } },
];
// Legacy boolean shapes still resolve via variantToResolveContext — same keys as
// named Found / Unfound / Return flows + pickup / needsClassify modifiers.

test('every declared capture step has a registered body, in every carton shape', () => {
  const unbox = getProcedure('unbox');
  assert.ok(unbox, 'the unbox procedure must be registered');

  for (const { name, variant } of SHAPES) {
    for (const step of resolveProcedureSteps(unbox, variant, 'capture')) {
      assert.ok(
        UNBOX_STEP_BODIES[step.key],
        `${name}: capture step "${step.key}" is declared but has no body in ` +
          `UNBOX_STEP_BODIES — it would render as an expanded step card with nothing ` +
          `in it, mid-carton. Add a body under line-edit/steps/.`,
      );
    }
  }
});

test('the registry holds no body for a step that is not declared', () => {
  const unbox = getProcedure('unbox')!;
  const declared = new Set(
    unbox.steps.filter((step) => step.phase === 'capture').map((step) => step.key),
  );
  for (const key of Object.keys(UNBOX_STEP_BODIES)) {
    assert.ok(
      declared.has(key),
      `"${key}" has a body but is not a declared capture step. A body with no step is ` +
        `dead code that reads as coverage — either declare the step or delete the body.`,
    );
  }
});

test('the three bench carton shots share ONE body', () => {
  // Three near-identical files is the fork this parameterisation exists to
  // prevent — they differ only in which aspect they capture.
  const shots = ['shipping_label_photo', 'box_photo', 'packing_material'];
  const bodies = new Set(shots.map((key) => UNBOX_STEP_BODIES[key]));
  assert.equal(
    bodies.size,
    1,
    'the carton photo steps must resolve to one shared body parameterised by aspect',
  );
});

test('arrival_check does NOT share the bench capture body', () => {
  // It reads the door's `arrival_package` evidence; the bench shots write
  // `unbox_carton`. Wiring it to the capture body would put a camera on the one
  // step whose whole job is that it cannot take one — and `arrival_package` is
  // the only stage the `require_one` receive gate counts.
  assert.notEqual(
    UNBOX_STEP_BODIES.arrival_check,
    UNBOX_STEP_BODIES.box_photo,
    'arrival_check must not mount the bench carton capture body',
  );
});
