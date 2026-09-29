import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SEARCH_ASSISTANT_CONTRACT,
  SEARCH_ASSISTANT_PANE_WIDTH_PX,
  resolveSearchAssistantFrameState,
  searchAssistantPaneMotion,
} from './search-assistant-motion';

test('derives frame state only from open and transcript truth', () => {
  assert.equal(resolveSearchAssistantFrameState(false, 0), 'closed');
  assert.equal(resolveSearchAssistantFrameState(false, 8), 'closed');
  assert.equal(resolveSearchAssistantFrameState(true, 0), 'composing');
  assert.equal(resolveSearchAssistantFrameState(true, 1), 'conversing');
});

test('only a conversation mounts the pane', () => {
  assert.equal(SEARCH_ASSISTANT_CONTRACT.targets.closed.paneMounted, false);
  assert.equal(SEARCH_ASSISTANT_CONTRACT.targets.composing.paneMounted, false);
  assert.equal(SEARCH_ASSISTANT_CONTRACT.targets.conversing.paneMounted, true);
});

test('reduced pane motion removes travel while preserving final geometry', () => {
  const full = searchAssistantPaneMotion(false);
  const reduced = searchAssistantPaneMotion(true);
  assert.equal(full.animate.width, SEARCH_ASSISTANT_PANE_WIDTH_PX);
  assert.equal(reduced.animate.width, SEARCH_ASSISTANT_PANE_WIDTH_PX);
  assert.equal('x' in reduced.initial, false);
  assert.equal('x' in reduced.exit, false);
});
