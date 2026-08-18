/**
 * Hard law: every declared capture step has a FACE — an icon.
 *
 * Third sibling of `procedure-divergence.guard.test.ts` (every step has a gate)
 * and `procedure-step-body.guard.test.ts` (every step has a body). Together they
 * cover the whole contract: the declaration owns the sequence, the bench owns
 * what counts as done, the registry owns what the operator does, and this owns
 * the glanceable glyph. Hue families are retired — stack geometry + state marks
 * carry place-keeping; every row shares one neutral surface.
 *
 * ## Why a missing face is worth a CI failure rather than a fallback
 *
 * `stepFace` DOES fall back — a bench that crashes mid-carton is far worse than
 * one showing a generic camera glyph. The fallback is a safety net, not an
 * answer: a step with no icon is a nameless tile in the stack. The net catches
 * it at the bench; this catches it before shipping.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/receiving/workspace/line-edit/steps/procedure-step-face.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProcedure,
  registerBuiltinProcedures,
  resolveProcedureSteps,
  type ProcedureVariant,
} from '@/lib/stations/procedure';
import { STEP_FACE_KEYS } from './step-face';

registerBuiltinProcedures();

/** Mirrors the sibling guards, so a new variant must be added to all of them. */
const SHAPES: ReadonlyArray<{ name: string; variant: Required<ProcedureVariant> }> = [
  { name: 'matched', variant: { isUnfound: false, isLocalPickup: false, isReturn: false } },
  { name: 'unfound', variant: { isUnfound: true, isLocalPickup: false, isReturn: false } },
  { name: 'local pickup', variant: { isUnfound: false, isLocalPickup: true, isReturn: false } },
  { name: 'return', variant: { isUnfound: false, isLocalPickup: false, isReturn: true } },
  { name: 'unfound return', variant: { isUnfound: true, isLocalPickup: false, isReturn: true } },
  { name: 'pickup return', variant: { isUnfound: false, isLocalPickup: true, isReturn: true } },
];

test('every declared capture step has a face, in every carton shape', () => {
  const unbox = getProcedure('unbox');
  assert.ok(unbox, 'the unbox procedure must be registered');
  const faces = new Set(STEP_FACE_KEYS);

  for (const { name, variant } of SHAPES) {
    for (const step of resolveProcedureSteps(unbox, variant, 'capture')) {
      assert.ok(
        faces.has(step.key),
        `${name}: capture step "${step.key}" has no face in step-face.tsx — it would ` +
          `wear the fallback camera glyph. Assign it an icon.`,
      );
    }
  }
});

test('the face registry holds no entry for a step that is not declared', () => {
  const unbox = getProcedure('unbox')!;
  const declared = new Set(
    unbox.steps.filter((step) => step.phase === 'capture').map((step) => step.key),
  );
  for (const key of STEP_FACE_KEYS) {
    assert.ok(
      declared.has(key),
      `"${key}" has a face but is not a declared capture step — dead config that reads ` +
        `as coverage.`,
    );
  }
});
