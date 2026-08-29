import assert from 'node:assert/strict';
import test from 'node:test';

import { dockTime } from './station-history-dock-feeds';

test('formats a timestamp as a 24h wall clock', () => {
  // Fixed offset so the assertion does not depend on the runner's zone.
  const iso = '2026-08-29T14:32:11Z';
  const expected = new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  assert.equal(dockTime(iso), expected);
  assert.match(dockTime(iso), /^\d{2}:\d{2}$/);
});

test('an absent or unparseable stamp renders nothing, never "Invalid Date"', () => {
  // A dock row with a broken time still has to be readable — the identifier is
  // the fact the operator came for.
  assert.equal(dockTime(null), '');
  assert.equal(dockTime(undefined), '');
  assert.equal(dockTime(''), '');
  assert.equal(dockTime('not-a-date'), '');
});
