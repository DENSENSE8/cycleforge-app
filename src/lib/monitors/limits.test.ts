import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_VIEW_MONITORS_PER_ORG, monitorCapExceeded } from './limits';

test('under the cap → may arm another monitor', () => {
  assert.equal(monitorCapExceeded(0), false);
  assert.equal(monitorCapExceeded(MAX_VIEW_MONITORS_PER_ORG - 1), false);
});

test('at the cap → may not arm (>= is the boundary)', () => {
  assert.equal(monitorCapExceeded(MAX_VIEW_MONITORS_PER_ORG), true);
});

test('over the cap (e.g. a stale/racy count) → still refused', () => {
  assert.equal(monitorCapExceeded(MAX_VIEW_MONITORS_PER_ORG + 5), true);
});
