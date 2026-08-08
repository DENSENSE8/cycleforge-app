import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  UNBOX_WORKSPACE_TABS,
  UNBOX_WORKSPACE_TAB_LABEL,
  getUnboxWorkspaceTabFromSearch,
  normalizeUnboxWorkspaceTabParams,
  parseUnboxViewWire,
  unboxKpiFeedTab,
} from './unbox-workspace-state';

/**
 * The Unbox tab strip keeps TWO vocabularies (see the module header): the UI
 * says Inbound · Queue · Recent · History; the wire keeps `?unboxview=viewed`
 * for Recent because `viewed` is the server-side feed name. These pin the seam.
 */

test('the strip reads Inbound · Queue · Recent · History, left to right', () => {
  assert.deepEqual([...UNBOX_WORKSPACE_TABS], ['incoming', 'queue', 'recent', 'history']);
  assert.deepEqual(
    UNBOX_WORKSPACE_TABS.map((t) => UNBOX_WORKSPACE_TAB_LABEL[t]),
    ['Inbound', 'Queue', 'Recent', 'History'],
  );
});

test('the wire value for Recent stays `viewed` (live links keep working)', () => {
  const params = new URLSearchParams();
  normalizeUnboxWorkspaceTabParams(params, 'recent');
  assert.equal(params.get('unboxview'), 'viewed');
  assert.equal(params.get('priority_only'), null);
  assert.equal(getUnboxWorkspaceTabFromSearch(params), 'recent');
});

test('Queue is the default and omits the param', () => {
  const params = new URLSearchParams('unboxview=history');
  normalizeUnboxWorkspaceTabParams(params, 'queue');
  assert.equal(params.get('unboxview'), null);
  assert.equal(params.get('priority_only'), null);
  assert.equal(getUnboxWorkspaceTabFromSearch(params), 'queue');
});

test('History takes an explicit wire value', () => {
  const params = new URLSearchParams();
  normalizeUnboxWorkspaceTabParams(params, 'history');
  assert.equal(params.get('unboxview'), 'history');
  assert.equal(getUnboxWorkspaceTabFromSearch(params), 'history');
});

test('parseUnboxViewWire accepts every live + migration token (hygiene SoT)', () => {
  for (const wire of ['incoming', 'queue', 'viewed', 'history', 'all', 'urgent', 'recent']) {
    assert.equal(parseUnboxViewWire(wire), wire);
  }
  assert.equal(parseUnboxViewWire(' HISTORY '), 'history');
  assert.equal(parseUnboxViewWire('nonsense'), null);
});

test('stale ?unboxview=urgent migrates to Queue (urgent is no longer a tab)', () => {
  assert.equal(
    getUnboxWorkspaceTabFromSearch(new URLSearchParams('unboxview=urgent')),
    'queue',
  );
  const params = new URLSearchParams('unboxview=urgent&priority_only=1');
  normalizeUnboxWorkspaceTabParams(params, 'queue');
  assert.equal(params.get('unboxview'), null);
  assert.equal(params.get('priority_only'), null);
});

test('All wire value still round-trips (deep-link only, not in the strip)', () => {
  const params = new URLSearchParams();
  normalizeUnboxWorkspaceTabParams(params, 'all');
  assert.equal(params.get('unboxview'), 'all');
  assert.equal(getUnboxWorkspaceTabFromSearch(params), 'all');
  assert.equal(UNBOX_WORKSPACE_TABS.includes('all'), false);
});

test('Inbound (incoming) is the first system tab and round-trips', () => {
  const params = new URLSearchParams();
  normalizeUnboxWorkspaceTabParams(params, 'incoming');
  assert.equal(params.get('unboxview'), 'incoming');
  assert.equal(params.get('priority_only'), null);
  assert.equal(getUnboxWorkspaceTabFromSearch(params), 'incoming');
  assert.equal(UNBOX_WORKSPACE_TAB_LABEL.incoming, 'Inbound');
  assert.equal(UNBOX_WORKSPACE_TABS[0], 'incoming');
});

test('a stale pre-rename `?unboxview=recent` falls through to Queue (default)', () => {
  // Before 2026-08-01 the wire value `recent` meant History. It was never
  // written by the app. After the 2026-08-08 process-order strip, unknown wire
  // values fall through to Queue (the new default).
  assert.equal(
    getUnboxWorkspaceTabFromSearch(new URLSearchParams('unboxview=recent')),
    'queue',
  );
});

test('unknown / absent values fall back to Queue', () => {
  assert.equal(getUnboxWorkspaceTabFromSearch(new URLSearchParams()), 'queue');
  assert.equal(
    getUnboxWorkspaceTabFromSearch(new URLSearchParams('unboxview=nonsense')),
    'queue',
  );
  assert.equal(
    getUnboxWorkspaceTabFromSearch(new URLSearchParams('unboxview=VIEWED')),
    'recent',
  );
});

test('KPI feed maps Inbound / All onto Queue metrics', () => {
  assert.equal(unboxKpiFeedTab('incoming'), 'queue');
  assert.equal(unboxKpiFeedTab('all'), 'queue');
  assert.equal(unboxKpiFeedTab('recent'), 'recent');
  assert.equal(unboxKpiFeedTab('history'), 'history');
  assert.equal(unboxKpiFeedTab('queue'), 'queue');
});
