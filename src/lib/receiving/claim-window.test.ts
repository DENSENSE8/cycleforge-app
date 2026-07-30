/**
 * Unit tests for the claim-window presentation kind (Phase 5 of
 * docs/todo/ebay-delivered-not-unboxed-PLAN.md).
 *
 * The point of this module is that ONE threshold drives both the escalation cron
 * and the grid chip, so the tests pin the shared boundary and the civil-date math.
 *
 * Run: `npx tsx --test src/lib/receiving/claim-window.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLAIM_DUE_LEAD_DAYS,
  claimCountdownFace,
  daysUntilClaimDeadline,
} from './claim-window';
// The cron must be reading the SAME symbols, not a private copy.
import {
  CLAIM_DUE_LEAD_DAYS as CRON_LEAD,
  daysUntilClaimDeadline as cronDays,
} from './claims-escalation';

const TODAY = '2026-07-29';

test('the cron and the UI share one threshold and one day function', () => {
  assert.equal(CRON_LEAD, CLAIM_DUE_LEAD_DAYS);
  assert.equal(cronDays, daysUntilClaimDeadline, 'must be the same function object');
});

test('day math is exact, signed, and free of UTC drift', () => {
  assert.equal(daysUntilClaimDeadline(TODAY, TODAY), 0);
  assert.equal(daysUntilClaimDeadline('2026-08-01', TODAY), 3);
  assert.equal(daysUntilClaimDeadline('2026-07-24', TODAY), -5);
  // Month boundary + a DST transition — still whole days.
  assert.equal(daysUntilClaimDeadline('2026-11-10', '2026-10-31'), 10);
});

test('expired reads EXPIRED, in danger tone, and says how long ago', () => {
  const f = claimCountdownFace('2026-07-20', TODAY);
  assert.equal(f.urgency, 'expired');
  assert.equal(f.daysRemaining, -9);
  assert.equal(f.label, 'EXPIRED');
  assert.equal(f.tone, 'text-rose-700');
  assert.match(f.description, /closed 9 days ago/);
  // Tells the operator what to DO, not just that it is bad.
  assert.match(f.description, /[Ww]rite the carton off/);
});

test('the due boundary is exactly the shared lead threshold', () => {
  const dueDate = '2026-08-03'; // CLAIM_DUE_LEAD_DAYS out
  assert.equal(daysUntilClaimDeadline(dueDate, TODAY), CLAIM_DUE_LEAD_DAYS);
  assert.equal(claimCountdownFace(dueDate, TODAY).urgency, 'due');

  const oneMore = '2026-08-04'; // one day past the threshold
  assert.equal(claimCountdownFace(oneMore, TODAY).urgency, 'upcoming');
});

test('closing today is called out explicitly, not shown as "0d closes in 0 days"', () => {
  const f = claimCountdownFace(TODAY, TODAY);
  assert.equal(f.urgency, 'due');
  assert.equal(f.label, '0d');
  assert.match(f.description, /closes TODAY/);
});

test('singular vs plural day wording', () => {
  assert.match(claimCountdownFace('2026-07-30', TODAY).description, /in 1 day \(/);
  assert.match(claimCountdownFace('2026-07-31', TODAY).description, /in 2 days \(/);
  assert.match(claimCountdownFace('2026-07-28', TODAY).description, /closed 1 day ago/);
});

test('upcoming is quiet — soft tone, no alarm', () => {
  const f = claimCountdownFace('2026-08-20', TODAY);
  assert.equal(f.urgency, 'upcoming');
  assert.equal(f.label, '22d');
  assert.equal(f.tone, 'text-text-soft');
});

test('labels stay short enough for a grid cell', () => {
  for (const d of ['2026-07-01', '2026-07-29', '2026-08-03', '2026-09-30']) {
    const { label } = claimCountdownFace(d, TODAY);
    assert.ok(label.length <= 7, `label "${label}" is too long for the status track`);
    assert.ok(!label.includes(' ') || label === 'EXPIRED', `label "${label}" must be one token`);
  }
});

test('every face carries a description for the tooltip / accessible name', () => {
  for (const d of ['2026-07-01', '2026-07-29', '2026-08-03', '2026-09-30']) {
    const f = claimCountdownFace(d, TODAY);
    assert.ok(f.description.length > 20, 'description must explain, not restate the label');
    assert.match(f.description, /eBay claim window/);
    // The deadline itself must be legible, not only the delta.
    assert.ok(f.description.includes(d), 'description must name the actual date');
  }
});

test('tone is a text color only — the status track is height-critical', () => {
  for (const d of ['2026-07-01', '2026-08-03', '2026-09-30']) {
    const { tone } = claimCountdownFace(d, TODAY);
    assert.match(tone, /^text-/);
    assert.ok(!/\b(bg|ring|border|p[xy]?-)/.test(tone), `tone "${tone}" must not add a box`);
  }
});
