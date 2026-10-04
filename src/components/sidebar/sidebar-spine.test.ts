import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPINE_NAVIGATION_BAND_ORDER,
  spineNavigationBand,
  spineNavigationBandTitle,
} from './sidebar-spine';

test('sidebar navigation families expose compact group titles; no Management band (operator 2026-10-03)', () => {
  assert.equal(spineNavigationBand('top'), 'utility');
  assert.equal(spineNavigationBand('reports'), 'bottom');
  assert.equal(spineNavigationBand('print-station'), 'bottom');
  assert.equal(spineNavigationBand('floor'), 'business');
  assert.equal(spineNavigationBand('sales'), 'business');
  // Rows that sat under "Management" now sit under "Operations".
  assert.equal(spineNavigationBand('support'), 'business');
  assert.equal(spineNavigationBand('monitor'), 'business');
  // The Live feed is one root row under the Operations subtitle.
  assert.equal(spineNavigationBand('live-feed'), 'business');

  assert.equal(spineNavigationBandTitle('utility'), 'Workspace');
  assert.equal(spineNavigationBandTitle('business'), 'Operations');
  assert.equal(spineNavigationBandTitle('bottom'), 'Utilities');
  assert.deepEqual(SPINE_NAVIGATION_BAND_ORDER.map(spineNavigationBandTitle), ['Workspace', 'Operations', 'Utilities']);
});
