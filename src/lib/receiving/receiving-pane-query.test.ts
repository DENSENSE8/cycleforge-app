/**
 * Unit coverage for prop-driven receiving pane mode state.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildReceivingPaneModeState,
  receivingPaneQueryKey,
} from './receiving-pane-query';

describe('receiving-pane-query', () => {
  it('maps Unbox tabs to table modes', () => {
    assert.equal(buildReceivingPaneModeState({ tab: 'queue' }).tableMode, 'unbox_queue');
    assert.equal(buildReceivingPaneModeState({ tab: 'recent' }).tableMode, 'unbox_viewed');
    assert.equal(buildReceivingPaneModeState({ tab: 'history' }).tableMode, 'history');
    assert.equal(buildReceivingPaneModeState({ tab: 'history' }).isHistoryMode, true);
  });

  it('forwards queue facets into mode context', () => {
    const state = buildReceivingPaneModeState({
      tab: 'queue',
      queueStage: 'unstaged',
      queueLane: 'RETURN',
      listSearch: 'ABC',
    });
    assert.equal(state.modeContext.queueStage, 'unstaged');
    assert.equal(state.modeContext.queueLane, 'RETURN');
    assert.equal(state.modeContext.listSearch, 'ABC');
  });

  it('builds a stable content key', () => {
    const a = receivingPaneQueryKey({ tab: 'queue', queueLane: 'HOLD' });
    const b = receivingPaneQueryKey({ tab: 'queue', queueLane: 'HOLD' });
    const c = receivingPaneQueryKey({ tab: 'history' });
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});
