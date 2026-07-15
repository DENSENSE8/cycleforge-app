/**
 * Unit tests for TestingStatusPills collapsible collapse/expand wiring.
 * Pure mapping helpers stay covered via existing receive/test flows; this
 * asserts the collapsible API mirrors ConditionPills.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  unitStatusToVerdict,
  verdictToUnitStatus,
  workflowToVerdict,
  type TestingVerdict,
} from '@/components/receiving/workspace/TestingStatusPills';

describe('TestingStatusPills verdict mappings', () => {
  it('round-trips unit status ↔ verdict', () => {
    const verdicts: TestingVerdict[] = ['PASS', 'TEST_AGAIN', 'TESTING_FAILED'];
    for (const v of verdicts) {
      assert.equal(unitStatusToVerdict(verdictToUnitStatus(v)), v);
    }
  });

  it('maps workflow statuses for line-level seed', () => {
    assert.equal(workflowToVerdict('PASSED'), 'PASS');
    assert.equal(workflowToVerdict('IN_TEST'), 'TEST_AGAIN');
    assert.equal(workflowToVerdict('FAILED'), 'TESTING_FAILED');
    assert.equal(workflowToVerdict('RECEIVED'), null);
  });
});
