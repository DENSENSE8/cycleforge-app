import assert from 'node:assert/strict';
import test from 'node:test';
import { spineNavigationBand, spineNavigationBandTitle } from './sidebar-spine';

test('sidebar navigation families expose compact group titles', () => {
  assert.equal(spineNavigationBand('top'), 'utility');
  assert.equal(spineNavigationBand('reports'), 'bottom');
  assert.equal(spineNavigationBand('support'), 'secondary');
  assert.equal(spineNavigationBand('floor'), 'business');

  assert.equal(spineNavigationBandTitle('utility'), 'Workspace');
  assert.equal(spineNavigationBandTitle('business'), 'Operations');
  assert.equal(spineNavigationBandTitle('secondary'), 'Management');
  assert.equal(spineNavigationBandTitle('bottom'), 'Utilities');
});
