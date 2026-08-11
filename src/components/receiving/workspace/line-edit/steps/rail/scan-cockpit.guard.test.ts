/**
 * Scan-cockpit guard — the KNOW half of the DO/KNOW split.
 *
 * Contract: `.claude/rules/display/scan-cockpit.md`. The right rail is the
 * current step's reference (a `StationDisplaysPushColumn` leaf), driven by the
 * one procedure derivation. This pins the invariants that keep it honest:
 *
 *   1. Every CAPTURE step is either in `UNBOX_STEP_RAIL_LEAF` (a real Displays
 *      leaf) OR in `UNBOX_STEPS_WITHOUT_RAIL_LEAF` with a reason — never both,
 *      never neither (mirror of `procedure-step-dock.guard`, so a step added
 *      without a rail decision fails CI instead of silently opening nothing).
 *   2. Rail-leaf values are real `UnboxSideTab` leaves — the cockpit IS the
 *      existing Displays column; no new region, no invented leaf.
 *   3. No rail entry names a non-capture step (dead coverage).
 *   4. Reasons are real (an exemption list without reasons is the escape hatch).
 *   5. `LineEditPanel` wires the cockpit: it drives the rail from `railLeaf`,
 *      auto-follow yields to an explicit close (the closed-for-carton ref), and it
 *      mounts the shared push column — not a new always-on region.
 *
 *   node --import tsx --test \
 *     src/components/receiving/workspace/line-edit/steps/rail/scan-cockpit.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  getProcedure,
  registerBuiltinProcedures,
  resolveProcedureSteps,
  type ProcedureVariant,
} from '@/lib/stations/procedure';
import { UNBOX_SIDE_TAB_ORDER } from '../../unbox-side-tabs';

// The procedure registry is populated by an explicit registrar (a procedure is a
// PR-reviewed capability declaration, not a module side-effect) — same call the
// dock guard makes before it reads `getProcedure('unbox')`.
registerBuiltinProcedures();
import {
  UNBOX_STEP_RAIL_LEAF,
  UNBOX_STEPS_WITHOUT_RAIL_LEAF,
  resolveStepRailLeaf,
} from './index';

/** Mirrors the dock guard's shape list — a new variant fails both. */
const SHAPES: ReadonlyArray<{ name: string; variant: Required<ProcedureVariant> }> = [
  { name: 'matched', variant: { isUnfound: false, isLocalPickup: false, isReturn: false } },
  { name: 'unfound', variant: { isUnfound: true, isLocalPickup: false, isReturn: false } },
  { name: 'local pickup', variant: { isUnfound: false, isLocalPickup: true, isReturn: false } },
  { name: 'return', variant: { isUnfound: false, isLocalPickup: false, isReturn: true } },
  { name: 'unfound return', variant: { isUnfound: true, isLocalPickup: false, isReturn: true } },
  { name: 'pickup return', variant: { isUnfound: false, isLocalPickup: true, isReturn: true } },
];

const VALID_LEAVES = new Set<string>(UNBOX_SIDE_TAB_ORDER);

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('scan cockpit — step rail-leaf registry', () => {
  it('every capture step EITHER references a rail leaf OR is declared reference-less', () => {
    const unbox = getProcedure('unbox');
    assert.ok(unbox, 'the unbox procedure must be registered');

    for (const { name, variant } of SHAPES) {
      for (const step of resolveProcedureSteps(unbox, variant, 'capture')) {
        const hasLeaf = Boolean(UNBOX_STEP_RAIL_LEAF[step.key]);
        const declaredLeafless = step.key in UNBOX_STEPS_WITHOUT_RAIL_LEAF;
        assert.ok(
          hasLeaf !== declaredLeafless,
          `${name}: capture step "${step.key}" must EITHER map to a rail leaf in ` +
            `UNBOX_STEP_RAIL_LEAF OR be listed in UNBOX_STEPS_WITHOUT_RAIL_LEAF with a reason ` +
            `— never both, never neither. A step with no rail decision opens nothing on ` +
            `advance, which is the silent-empty-rail failure the either-or exists to prevent.`,
        );
        // resolveStepRailLeaf is the derivation the hook uses — it must agree.
        assert.equal(
          resolveStepRailLeaf(step.key),
          UNBOX_STEP_RAIL_LEAF[step.key] ?? null,
          `${name}: resolveStepRailLeaf("${step.key}") must match the registry`,
        );
      }
    }
  });

  it('every rail-leaf value is a real UnboxSideTab leaf (no invented leaf, no new region)', () => {
    for (const [key, leaf] of Object.entries(UNBOX_STEP_RAIL_LEAF)) {
      assert.ok(
        leaf && VALID_LEAVES.has(leaf),
        `"${key}" → "${leaf}" is not a declared Displays leaf — the cockpit is the existing ` +
          `StationDisplaysPushColumn, so a rail reference must be a real UnboxSideTab.`,
      );
    }
  });

  it('the rail registry holds no entry for a step that is not a declared capture step', () => {
    const unbox = getProcedure('unbox')!;
    const declared = new Set(
      unbox.steps.filter((step) => step.phase === 'capture').map((step) => step.key),
    );
    for (const key of Object.keys(UNBOX_STEP_RAIL_LEAF)) {
      assert.ok(
        declared.has(key),
        `"${key}" has a rail leaf but is not a declared capture step — dead coverage.`,
      );
    }
    for (const key of Object.keys(UNBOX_STEPS_WITHOUT_RAIL_LEAF)) {
      assert.ok(declared.has(key), `"${key}" is exempted from a rail leaf but is not a step`);
    }
  });

  it('settled / non-capture steps resolve to null (no forced rail)', () => {
    assert.equal(resolveStepRailLeaf(null), null, 'settled ⇒ no rail leaf');
    assert.equal(resolveStepRailLeaf('scan'), null, 'intake step ⇒ no rail leaf');
    assert.equal(resolveStepRailLeaf('stage'), null, 'commit stage ⇒ work-plane Placement');
    assert.equal(resolveStepRailLeaf('receive'), null, 'commit step ⇒ no rail leaf');
  });

  it('every reference-less exemption carries a real reason', () => {
    for (const [key, reason] of Object.entries(UNBOX_STEPS_WITHOUT_RAIL_LEAF)) {
      assert.ok(
        reason.trim().length > 20,
        `"${key}" is exempted from a rail leaf with no real reason — an exemption list without ` +
          `reasons becomes the rule's escape hatch.`,
      );
    }
  });
});

describe('scan cockpit — LineEditPanel wiring', () => {
  const panel = read('src/components/receiving/workspace/LineEditPanel.tsx');

  it('drives the rail from the derived railLeaf (one derivation, no second store)', () => {
    assert.match(panel, /railLeaf/, 'LineEditPanel must read railLeaf from useUnboxProcedureSteps');
    assert.match(
      panel,
      /openDisplays\(railLeaf\)/,
      'the cockpit effect must open the step\'s railLeaf',
    );
  });

  it('auto-follow yields to an explicit close, per carton', () => {
    assert.match(
      panel,
      /cockpitClosedForCartonRef/,
      'an explicit close must be recorded so auto-follow yields until the next carton',
    );
    assert.match(
      panel,
      /cockpitClosedForCartonRef\.current === cartonKey/,
      'the cockpit effect must skip a carton (not a child line) the operator explicitly closed',
    );
  });

  it('auto-follow yields to Index or a picked leaf (Photos), until the step advances', () => {
    assert.match(
      panel,
      /showDisplays && activeSideTab !== railLeaf && !stepChanged && !cartonChanged/,
      'picking Photos while railLeaf is Units must not be immediately re-yanked',
    );
    assert.match(
      panel,
      /prevCockpitActiveKeyRef/,
      'stepChanged is derived so a beat advance can still swap the cockpit leaf',
    );
    assert.match(
      panel,
      /prevCockpitCartonRef/,
      'cartonChanged resumes auto-follow on a new carton even when activeKey is unchanged',
    );
    assert.match(
      panel,
      /const cartonChanged = prevCockpitCartonRef\.current !== cartonKey/,
      'a sibling CHILD switch (same carton) is NOT a record change — the cockpit ' +
        'must key on the parent carton so it never yanks a display the operator chose',
    );
  });

  it('the cockpit is the shared push column — not a new always-on region', () => {
    assert.match(
      panel,
      /StationDisplaysPushStack/,
      'the cockpit must be the existing StationDisplaysPushColumn (no third right-edge grammar)',
    );
  });
});
