/**
 * Panel honesty — "it's on the panel" is corrected unless the turn opened
 * something on the right; inline data never counts.
 * Run: npx tsx --test src/lib/assistant/panel-honesty.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INLINE_CLAIM_CORRECTION, PANEL_CLAIM_CORRECTION, panelClaimCorrection } from './panel-honesty';

const NOTHING = { inline: 0, rail: 0 };

test('a panel claim in a turn that showed nothing is corrected', () => {
  for (const answer of [
    'The location of SKU 00066-P-2 is shown in the panel.',
    'I pulled the bins up — see the table.',
    'You can find it on the right-hand panel.',
    'Here are the bins. The table is displayed on the side panel.',
  ]) {
    assert.equal(panelClaimCorrection(answer, NOTHING), PANEL_CLAIM_CORRECTION, answer);
  }
});

test('a panel claim about inline data is corrected to "in the chat"', () => {
  assert.equal(panelClaimCorrection('The location table is displayed on the panel.', { inline: 1, rail: 0 }), INLINE_CLAIM_CORRECTION);
});

test('the claim is left alone when the turn really opened a document on the right', () => {
  assert.equal(panelClaimCorrection('The shipping label is opened on the right panel.', { inline: 0, rail: 1 }), null);
});

test('a denial of the panel is true when nothing opened, so it is never "corrected"', () => {
  for (const answer of [
    'Nothing matched, so there is nothing to show on the panel.',
    "SKU ZZ-1 isn't in any bin — I didn't put anything on the panel.",
  ]) {
    assert.equal(panelClaimCorrection(answer, NOTHING), null, answer);
  }
});

test('an answer that never mentions the panel is left alone', () => {
  assert.equal(panelClaimCorrection('SKU 00066-P-2 is in C-03-12-3 (41) and C-03-16-3 (1).', { inline: 1, rail: 0 }), null);
  assert.equal(panelClaimCorrection('The side table in the break room is empty.', NOTHING), null);
});
