/**
 * Unit tests for Station Timeline subtitle filters.
 *
 *   npx tsx --test src/lib/timeline/station-subtitle.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isRawStatusTrailSubtitle, softenStatusTrailSubtitle } from './station-subtitle';

test('isRawStatusTrailSubtitle: machine PREV → NEXT', () => {
  assert.equal(isRawStatusTrailSubtitle('RECEIVED → ON_HOLD'), true);
  assert.equal(isRawStatusTrailSubtitle('IN_TEST → TESTED'), true);
  assert.equal(isRawStatusTrailSubtitle('  OPEN → CLOSED  '), true);
});

test('isRawStatusTrailSubtitle: human / location / notes are not trails', () => {
  assert.equal(isRawStatusTrailSubtitle(undefined), false);
  assert.equal(isRawStatusTrailSubtitle(''), false);
  assert.equal(isRawStatusTrailSubtitle('2 photos'), false);
  assert.equal(isRawStatusTrailSubtitle('Memphis, TN'), false);
  assert.equal(isRawStatusTrailSubtitle('HDMI_DEAD — no output'), false);
  assert.equal(isRawStatusTrailSubtitle('Received → On hold'), false);
});

test('softenStatusTrailSubtitle: sentence-case tokens', () => {
  assert.equal(softenStatusTrailSubtitle('RECEIVED → ON_HOLD'), 'Received → On Hold');
  assert.equal(softenStatusTrailSubtitle('IN_TEST → TESTED'), 'In Test → Tested');
});
