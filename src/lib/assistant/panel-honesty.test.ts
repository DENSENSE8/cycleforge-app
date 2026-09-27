/**
 * Panel honesty — the "it's on the panel" claim is corrected only when false.
 * Run: npx tsx --test src/lib/assistant/panel-honesty.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANEL_CLAIM_CORRECTION, panelClaimCorrection } from './panel-honesty';

test('a panel claim in a turn that painted nothing is corrected', () => {
  for (const answer of [
    'The location of SKU 00066-P-2 is shown in the panel.',
    'I pulled the bins up — see the table.',
    'You can find it on the right-hand panel.',
    'Here are the bins. The table is displayed on the side panel.',
  ]) {
    assert.equal(panelClaimCorrection(answer, 0), PANEL_CLAIM_CORRECTION, answer);
  }
});

test('the same claim is left alone when the turn really painted an artifact', () => {
  assert.equal(panelClaimCorrection('The location table is displayed on the panel.', 1), null);
});

test('a denial of the panel is true when nothing painted, so it is never "corrected"', () => {
  for (const answer of [
    'Nothing matched, so there is nothing to show on the panel.',
    "SKU ZZ-1 isn't in any bin — I didn't put anything on the panel.",
  ]) {
    assert.equal(panelClaimCorrection(answer, 0), null, answer);
  }
});

test('an answer that never mentions the panel is left alone', () => {
  assert.equal(panelClaimCorrection('SKU 00066-P-2 is in C-03-12-3 (41) and C-03-16-3 (1).', 0), null);
  assert.equal(panelClaimCorrection('The side table in the break room is empty.', 0), null);
});
