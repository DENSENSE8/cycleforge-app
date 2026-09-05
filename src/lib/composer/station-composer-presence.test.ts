/**
 *   npx tsx --test src/lib/composer/station-composer-presence.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStationComposerStationCount,
  registerStationComposerPresence,
} from './station-composer-presence';

test('station mouths increment; desk fallback does not', () => {
  assert.equal(getStationComposerStationCount(), 0);
  const desk = registerStationComposerPresence('desk');
  assert.equal(getStationComposerStationCount(), 0);
  desk();
  const a = registerStationComposerPresence('station');
  const b = registerStationComposerPresence('station');
  assert.equal(getStationComposerStationCount(), 2);
  a();
  assert.equal(getStationComposerStationCount(), 1);
  b();
  assert.equal(getStationComposerStationCount(), 0);
});
