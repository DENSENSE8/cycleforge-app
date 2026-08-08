/**
 * Unfound capture is dock-completable — every UNFOUND_CAPTURE step has a dock
 * control OR a stated actionless reason (arrival_check only today).
 *
 * HANDOFF: docs/todo/unfound-dock-receive-HANDOFF.md
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/receiving/workspace/line-edit/steps/dock/unfound-dock-completable.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getProcedure,
  registerBuiltinProcedures,
  resolveProcedureSteps,
} from '@/lib/stations/procedure';
import { UNBOX_STEP_DOCK_CONTROLS, UNBOX_STEPS_WITHOUT_DOCK_ACTION } from './index';

registerBuiltinProcedures();

test('unfound capture steps are dock-completable (control XOR stated absence)', () => {
  const unbox = getProcedure('unbox');
  assert.ok(unbox, 'unbox procedure registered');

  const steps = resolveProcedureSteps(
    unbox,
    { isUnfound: true, isLocalPickup: false, isReturn: false },
    'capture',
  );

  assert.ok(
    steps.some((s) => s.key === 'classify'),
    'unfound capture must include classify',
  );
  assert.ok(
    UNBOX_STEP_DOCK_CONTROLS.classify,
    'classify must have a dock control (TriageClassifySection via classifySlot)',
  );
  assert.ok(
    !('classify' in UNBOX_STEPS_WITHOUT_DOCK_ACTION),
    'classify must leave UNBOX_STEPS_WITHOUT_DOCK_ACTION when it has a dock control',
  );

  for (const step of steps) {
    const hasDock = Boolean(UNBOX_STEP_DOCK_CONTROLS[step.key]);
    const declaredActionless = step.key in UNBOX_STEPS_WITHOUT_DOCK_ACTION;
    assert.ok(
      hasDock !== declaredActionless,
      `unfound: "${step.key}" must have a dock control OR a stated actionless reason — never both, never neither`,
    );
  }
});

test('unfound contents create path is wired in ContentsDockControl', () => {
  const src = readFileSync(
    join(
      process.cwd(),
      'src/components/receiving/workspace/line-edit/steps/dock/AcknowledgeDockControl.tsx',
    ),
    'utf8',
  );
  assert.match(
    src,
    /data-unbox-contents-create/,
    'contents creates unmatched line when stub',
  );
  assert.match(src, /addUnmatchedLine/, 'uses shared add-unmatched-line client');
  assert.match(src, /CartonAddPopover/, 'reuses CartonAddPopover — no second search UI');
});
