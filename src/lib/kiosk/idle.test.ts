import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  DEFAULT_KIOSK_IDLE_PROMPT_S,
  KIOSK_IDLE_PROMPT_GRACE_S,
  MAX_KIOSK_IDLE_PROMPT_S,
  MIN_KIOSK_IDLE_PROMPT_S,
  clampIdlePromptSeconds,
  resolveKioskIdleTiming,
} from './idle';

test('an unset org falls back to the default prompt threshold', () => {
  for (const raw of [undefined, null, '']) {
    assert.equal(clampIdlePromptSeconds(raw), DEFAULT_KIOSK_IDLE_PROMPT_S);
  }
});

test('a garbage settings value degrades instead of throwing', () => {
  // An unattended tablet keeps working through a bad JSON value; a screensaver
  // setting is never worth a blank counter screen.
  for (const raw of ['soon', {}, [], NaN, Infinity, -Infinity]) {
    assert.equal(clampIdlePromptSeconds(raw), DEFAULT_KIOSK_IDLE_PROMPT_S);
  }
});

test('a numeric string is accepted (org JSON is not typed at the edge)', () => {
  assert.equal(clampIdlePromptSeconds('90'), 90);
});

test('values clamp to the legal band rather than being ignored', () => {
  assert.equal(clampIdlePromptSeconds(1), MIN_KIOSK_IDLE_PROMPT_S);
  assert.equal(clampIdlePromptSeconds(0), MIN_KIOSK_IDLE_PROMPT_S);
  assert.equal(clampIdlePromptSeconds(-30), MIN_KIOSK_IDLE_PROMPT_S);
  assert.equal(clampIdlePromptSeconds(99_999), MAX_KIOSK_IDLE_PROMPT_S);
});

test('fractional seconds round to whole ticks (the shell counts by 1s)', () => {
  assert.equal(clampIdlePromptSeconds(45.4), 45);
  assert.equal(clampIdlePromptSeconds(45.6), 46);
});

test('attract always trails the prompt by the fixed grace window', () => {
  const { promptAtS, attractAtS } = resolveKioskIdleTiming(120);
  assert.equal(promptAtS, 120);
  assert.equal(attractAtS, 120 + KIOSK_IDLE_PROMPT_GRACE_S);
});

test('the default resolves to the 60 → 70 timing the shell shipped with', () => {
  const { promptAtS, attractAtS } = resolveKioskIdleTiming(undefined);
  assert.equal(promptAtS, 60);
  assert.equal(attractAtS, 70);
});

test('the grace window is never zero — a prompt must be readable', () => {
  assert.ok(KIOSK_IDLE_PROMPT_GRACE_S > 0);
  const { promptAtS, attractAtS } = resolveKioskIdleTiming(MIN_KIOSK_IDLE_PROMPT_S);
  assert.ok(attractAtS > promptAtS);
});
