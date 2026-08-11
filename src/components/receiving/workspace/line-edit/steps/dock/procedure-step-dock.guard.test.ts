/**
 * Hard law: **a procedure step CARD carries no action button. The dock does.**
 *
 * Ruled 2026-08-02. Third sibling of `procedure-step-body.guard.test.ts` (every
 * declared step has a body) and `procedure-divergence.guard.test.ts` (every
 * declared step has a gate). Together: the declaration owns the sequence, the
 * bench owns "what counts as done", the body owns what you READ, and this owns
 * where you PRESS.
 *
 * ## Why this is a test and not a convention
 *
 * The regression is one import. A step body that reaches for `Button` or
 * `ReceivingPhotoButton` renders a control that looks completely correct in a
 * screenshot — and is wrong for two reasons a screenshot cannot show: the deck
 * scrolls, so the control sits at whatever offset the operator left it at
 * (including underneath the dock, which is exactly how the label preview came to
 * slide beneath the composer before it became a step); and it is not where the
 * hand already is. Convention does not survive the next person adding "just one
 * confirm button" to a card.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/receiving/workspace/line-edit/steps/dock/procedure-step-dock.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  getProcedure,
  registerBuiltinProcedures,
  resolveProcedureSteps,
  type ProcedureVariant,
} from '@/lib/stations/procedure';
import { UNBOX_STEP_BODIES } from '../index';
import {
  UNBOX_COMMIT_DOCK_KEYS,
  UNBOX_STEP_DOCK_CONTROLS,
  UNBOX_STEPS_WITHOUT_DOCK_ACTION,
} from './index';

registerBuiltinProcedures();

const STEPS_DIR = join(process.cwd(), 'src/components/receiving/workspace/line-edit/steps');

/** Mirrors the body guard's shape list on purpose — a new variant fails both. */
const SHAPES: ReadonlyArray<{ name: string; variant: Required<ProcedureVariant> }> = [
  { name: 'matched', variant: { isUnfound: false, isLocalPickup: false, isReturn: false } },
  { name: 'unfound', variant: { isUnfound: true, isLocalPickup: false, isReturn: false } },
  { name: 'local pickup', variant: { isUnfound: false, isLocalPickup: true, isReturn: false } },
  { name: 'return', variant: { isUnfound: false, isLocalPickup: false, isReturn: true } },
  { name: 'unfound return', variant: { isUnfound: true, isLocalPickup: false, isReturn: true } },
  { name: 'pickup return', variant: { isUnfound: false, isLocalPickup: true, isReturn: true } },
];

/**
 * Body files only — NOT `./dock/**`, which is where the controls belong, and not
 * the composed surfaces the bodies mount as slots (`PoLinesAccordion`,
 * `TriageClassifySection`, `SerialCard`). Those are editors reached through a
 * slot; the ban is on a body *rendering an action itself*.
 */
function stepBodyFiles(): string[] {
  return readdirSync(STEPS_DIR)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => join(STEPS_DIR, f));
}

/**
 * Action imports a step body must not reach for.
 *
 * `Button`/`IconButton` are the house action primitives; `ReceivingPhotoButton`
 * is the capture pill. A body needing one of these is a body doing the dock's
 * job.
 */
const BANNED_IN_BODY = [
  { needle: 'ReceivingPhotoButton', why: 'the capture pill belongs in the dock control' },
  { needle: "from '@/design-system/primitives'", why: 'Button/IconButton are action primitives' },
];

/**
 * Files in `steps/` that are NOT step bodies. Each needs a reason, so the
 * allowlist cannot quietly become the escape hatch that voids the rule.
 */
const NOT_A_BODY: Readonly<Record<string, string>> = {
  'types.ts': 'types',
  'index.ts': 'registry',
  'step-face.tsx': 'face glyph + hue registry, not a body',
};

test('every declared capture step has a body — and its ACTION is in the dock or nowhere', () => {
  const unbox = getProcedure('unbox');
  assert.ok(unbox, 'the unbox procedure must be registered');

  for (const { name, variant } of SHAPES) {
    for (const step of resolveProcedureSteps(unbox, variant, 'capture')) {
      assert.ok(
        UNBOX_STEP_BODIES[step.key],
        `${name}: capture step "${step.key}" has no body`,
      );
      const hasDock = Boolean(UNBOX_STEP_DOCK_CONTROLS[step.key]);
      const declaredActionless = step.key in UNBOX_STEPS_WITHOUT_DOCK_ACTION;
      assert.ok(
        hasDock !== declaredActionless,
        `${name}: capture step "${step.key}" must EITHER have a dock control OR be listed in ` +
          `UNBOX_STEPS_WITHOUT_DOCK_ACTION with a reason — never both, never neither. A step ` +
          `with no entry in either renders a card the operator cannot act on and a dock band ` +
          `that silently goes empty on them.`,
      );
    }
  }
});

test('the dock registry holds no control for a step that is not declared', () => {
  const unbox = getProcedure('unbox')!;
  const declared = new Set(
    unbox.steps.filter((step) => step.phase === 'capture').map((step) => step.key),
  );
  // Commit-phase dock keys (e.g. post-print `stage`) are intentional — see
  // UNBOX_COMMIT_DOCK_KEYS. They are not capture vocabulary.
  for (const key of UNBOX_COMMIT_DOCK_KEYS) declared.add(key);
  for (const key of Object.keys(UNBOX_STEP_DOCK_CONTROLS)) {
    assert.ok(
      declared.has(key),
      `"${key}" has a dock control but is not a declared capture/commit step — a control with no ` +
        `step is dead code that reads as coverage.`,
    );
  }
  for (const key of Object.keys(UNBOX_STEPS_WITHOUT_DOCK_ACTION)) {
    assert.ok(declared.has(key), `"${key}" is exempted from a dock control but is not a step`);
  }
});

test('the three bench carton shots share ONE dock control', () => {
  const shots = ['shipping_label_photo', 'box_photo', 'packing_material'];
  const controls = new Set(shots.map((key) => UNBOX_STEP_DOCK_CONTROLS[key]));
  assert.equal(
    controls.size,
    1,
    'the carton photo steps must resolve to one shared dock control parameterised by aspect',
  );
});

test('no step BODY renders an action control', () => {
  for (const file of stepBodyFiles()) {
    const base = file.split('/').pop()!;
    if (base.endsWith('.test.ts') || base.endsWith('.test.tsx')) continue;
    if (base in NOT_A_BODY) continue;

    const src = readFileSync(file, 'utf8');
    for (const { needle, why } of BANNED_IN_BODY) {
      assert.ok(
        !src.includes(needle),
        `${base} imports \`${needle}\` — ${why}. A step card carries no action button ` +
          `(.claude/rules/display/station-workbench.md → "The dock's LEADING zone is the ` +
          `step's ACTION surface"). Move it to steps/dock/ and register it in ` +
          `UNBOX_STEP_DOCK_CONTROLS. If this file is not a step body, add it to NOT_A_BODY ` +
          `with a reason.`,
      );
    }
  }
});

test('every exemption carries a reason, not just a key', () => {
  for (const [key, reason] of Object.entries(UNBOX_STEPS_WITHOUT_DOCK_ACTION)) {
    assert.ok(
      reason.trim().length > 20,
      `"${key}" is exempted from a dock action with no real reason — an exemption list ` +
        `without reasons becomes the rule's escape hatch.`,
    );
  }
});
