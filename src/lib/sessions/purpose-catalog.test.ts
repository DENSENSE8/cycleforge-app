import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SCAN_SESSION_TYPES } from './types';
import { SYSTEM_PURPOSES, SYSTEM_SCAN_PURPOSE_KEYS } from './purpose-catalog';

test('starter catalog covers every scan type and the desk buckets', () => {
  assert.deepEqual([...SYSTEM_SCAN_PURPOSE_KEYS].sort(), [...SCAN_SESSION_TYPES].sort());
  const keys = new Set(SYSTEM_PURPOSES.map((p) => p.key));
  for (const key of [
    'front-desk',
    'kiosk',
    'staff-assist',
    'product-triage',
    'listing',
    'repair',
    'inventory',
  ]) {
    assert.equal(keys.has(key), true, key);
  }
  assert.equal(
    SYSTEM_PURPOSES.every((p) => p.defaultKind === 'scan' || p.defaultKind === 'task'),
    true,
  );
});
