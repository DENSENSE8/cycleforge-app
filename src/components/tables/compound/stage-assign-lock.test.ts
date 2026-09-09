/**
 * Stage-cell assign lock — pending steps invite assign; stamped steps do not.
 * The empty/pending mark is the combo trigger (CompoundStageStep).
 *
 * Run: node --import tsx --test src/components/tables/compound/stage-assign-lock.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canAssignCompoundStage } from './compound-row-model';

const assign = {
  selectedStaffId: null as number | null,
  label: 'Pick',
  role: 'technician' as const,
  onCommit: () => {},
};

describe('stage assign lock', () => {
  it('arms when assign handler is present and step has no stamp', () => {
    assert.equal(canAssignCompoundStage(assign, null), true);
    assert.equal(canAssignCompoundStage(assign, ''), true);
  });

  it('locks when the stage is done', () => {
    assert.equal(canAssignCompoundStage(assign, 'Jul 13, 4:15 PM'), false);
  });

  it('stays inert without a host handler', () => {
    assert.equal(canAssignCompoundStage(undefined, null), false);
  });
});
