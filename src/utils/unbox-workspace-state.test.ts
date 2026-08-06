import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  UNBOX_WORKSPACE_TABS,
  UNBOX_WORKSPACE_TAB_LABEL,
  getUnboxWorkspaceTabFromSearch,
  normalizeUnboxWorkspaceTabParams,
} from './unbox-workspace-state';

/**
 * The Unbox tab strip keeps TWO vocabularies (see the module header): the UI
 * says Recent · Queue · History, the wire keeps `?unboxview=viewed` because
 * `viewed` is the server-side name for that feed (`view=viewed`,
 * `unbox_viewed`, `receiving_line_views`). These pin the seam.
 */

test('the strip reads Urgent · Recent · Queue · All · History, left to right', () => {
  assert.deepEqual([...UNBOX_WORKSPACE_TABS], ['urgent', 'recent', 'queue', 'all', 'history']);
  assert.deepEqual(
    UNBOX_WORKSPACE_TABS.map((t) => UNBOX_WORKSPACE_TAB_LABEL[t]),
    ['Urgent', 'Recent', 'Queue', 'All', 'History'],
  );
});

test('the wire value for Recent stays `viewed` (live links keep working)', () => {
  const params = new URLSearchParams();
  normalizeUnboxWorkspaceTabParams(params, 'recent');
  assert.equal(params.get('unboxview'), 'viewed');
  assert.equal(params.get('priority_only'), null);
  assert.equal(getUnboxWorkspaceTabFromSearch(params), 'recent');
});

test('History is the default and omits the param', () => {
  const params = new URLSearchParams('unboxview=queue');
  normalizeUnboxWorkspaceTabParams(params, 'history');
  assert.equal(params.get('unboxview'), null);
  assert.equal(params.get('priority_only'), null);
  assert.equal(getUnboxWorkspaceTabFromSearch(params), 'history');
});

test('Urgent owns priority_only=1 and clears it on leave', () => {
  const params = new URLSearchParams();
  normalizeUnboxWorkspaceTabParams(params, 'urgent');
  assert.equal(params.get('unboxview'), 'urgent');
  assert.equal(params.get('priority_only'), '1');
  normalizeUnboxWorkspaceTabParams(params, 'queue');
  assert.equal(params.get('unboxview'), 'queue');
  assert.equal(params.get('priority_only'), null);
});

test('All wire value round-trips', () => {
  const params = new URLSearchParams();
  normalizeUnboxWorkspaceTabParams(params, 'all');
  assert.equal(params.get('unboxview'), 'all');
  assert.equal(getUnboxWorkspaceTabFromSearch(params), 'all');
});

test('a stale pre-rename `?unboxview=recent` still lands on History', () => {
  // Before 2026-08-01 the wire value `recent` MEANT the History tab. It was
  // never written by the app (normalize omits the param for the default), so
  // it only reaches us hand-typed — and falling through to the default puts it
  // exactly where it used to go, with no alias branch to maintain.
  assert.equal(
    getUnboxWorkspaceTabFromSearch(new URLSearchParams('unboxview=recent')),
    'history',
  );
});

test('unknown / absent values fall back to History', () => {
  assert.equal(getUnboxWorkspaceTabFromSearch(new URLSearchParams()), 'history');
  assert.equal(
    getUnboxWorkspaceTabFromSearch(new URLSearchParams('unboxview=nonsense')),
    'history',
  );
  // Case-insensitive, same as every other param parser here.
  assert.equal(
    getUnboxWorkspaceTabFromSearch(new URLSearchParams('unboxview=VIEWED')),
    'recent',
  );
});
