/**
 * Session-title display guard. The stale-row fixtures are VERBATIM
 * `ai_chat_sessions.title` values measured on 2026-09-07 (org
 * 00000000-…-0001), written before the title writer stripped Harmony.
 * Run: npx tsx --test src/lib/ai/session-title-text.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displaySessionTitle, sanitizeSessionTitle } from './session-title-text';

/** Measured stale row: pure deliberation, no name in it at all. */
const ANALYSIS_ONLY =
  '<|channel|>analysis<|message|>User says "Show me the packing pace by packer for today." ' +
  'We need to produce a title.';

/** Measured shape when the model DID answer but the wrapper was stored too. */
const WITH_FINAL =
  '<|channel|>analysis<|message|>We need a terse title<|end|>' +
  '<|start|>assistant<|channel|>final<|message|>Packing Pace By Packer';

test('a stale analysis-only title never reaches the operator', () => {
  assert.equal(sanitizeSessionTitle(ANALYSIS_ONLY), '');
  const shown = displaySessionTitle(ANALYSIS_ONLY);
  assert.equal(shown, 'Untitled session');
  assert.ok(!shown.includes('<|'));
});

test('the final channel is what the row is named', () => {
  assert.equal(displaySessionTitle(WITH_FINAL), 'Packing Pace By Packer');
});

test('a surface keeps its own word for a nameless thread', () => {
  assert.equal(displaySessionTitle(null, 'Session'), 'Session');
  assert.equal(displaySessionTitle('   ', 'Session'), 'Session');
  assert.equal(displaySessionTitle(ANALYSIS_ONLY, 'Session'), 'Session');
});

test('a clean title survives untouched; an overlong one is capped', () => {
  assert.equal(displaySessionTitle('Unshipped Orders Today'), 'Unshipped Orders Today');
  const long = 'a'.repeat(120);
  const capped = displaySessionTitle(long);
  assert.equal(capped.length, 80);
  assert.ok(capped.endsWith('\u2026'));
});
