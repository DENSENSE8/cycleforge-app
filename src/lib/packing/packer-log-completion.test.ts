import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isCompletedPackerLog,
  isPackerLogCompletionState,
  PACKER_LOG_COMPLETED,
  PACKER_LOG_COMPLETION_STATES,
} from './packer-log-completion';

test('packer-log completion contract reserves completion for a real pack fact', () => {
  assert.deepEqual(PACKER_LOG_COMPLETION_STATES, ['CAPTURING', 'COMPLETED', 'CANCELLED']);
  assert.equal(isPackerLogCompletionState('CAPTURING'), true);
  assert.equal(isPackerLogCompletionState('draft'), false);
  assert.equal(isCompletedPackerLog(PACKER_LOG_COMPLETED), true);
  assert.equal(isCompletedPackerLog('CAPTURING'), false);
});
