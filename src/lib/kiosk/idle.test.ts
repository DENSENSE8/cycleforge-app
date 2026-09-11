/**
 * Callers: `node --test src/lib/kiosk/idle.test.ts`.
 * Covers `resolveKioskIdleTiming` only — always off (Phase 1 C3).
 * User: continue with the next phase (kill kiosk timeout).
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { resolveKioskIdleTiming } from './idle';

test('consult idle is off when the org sets nothing', () => {
  for (const raw of [undefined, null, '']) {
    const timing = resolveKioskIdleTiming(raw);
    assert.equal(timing.enabled, false);
    assert.equal(timing.promptAtS, null);
    assert.equal(timing.attractAtS, null);
  }
});

test('a leftover timeout number cannot re-enable the prompt or attract', () => {
  for (const raw of [15, 60, 70, 3600, 99_999, '90', 0, -30, 1]) {
    const timing = resolveKioskIdleTiming(raw);
    assert.equal(timing.enabled, false);
    assert.equal(timing.promptAtS, null);
    assert.equal(timing.attractAtS, null);
  }
});

test('garbage settings still resolve to off rather than throwing', () => {
  for (const raw of ['soon', {}, [], NaN, Infinity, -Infinity]) {
    const timing = resolveKioskIdleTiming(raw);
    assert.equal(timing.enabled, false);
  }
});
