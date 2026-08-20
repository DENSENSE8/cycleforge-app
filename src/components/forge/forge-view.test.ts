import test from 'node:test';
import assert from 'node:assert/strict';
import { forgeViewParam, parseForgeView } from '@/components/forge/forge-view';

test('parseForgeView: live and agent are agent-primary; doc is doc', () => {
  assert.equal(parseForgeView('live'), 'agent');
  assert.equal(parseForgeView('agent'), 'agent');
  assert.equal(parseForgeView(null), 'agent');
  assert.equal(parseForgeView(undefined), 'agent');
  assert.equal(parseForgeView('garbage'), 'agent');
  assert.equal(parseForgeView('doc'), 'doc');
});

test('forgeViewParam prefers live bookmark for agent-primary', () => {
  assert.equal(forgeViewParam('agent'), 'live');
  assert.equal(forgeViewParam('doc'), 'doc');
});
