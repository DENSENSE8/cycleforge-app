/**
 * unbox-station-tape tests — the vocabulary, not the loop.
 *
 *   npx tsx --test src/components/mobile/receiving/unbox-station-tape.test.ts
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { UNBOX_TAPE_LABEL, UNBOX_DEDUPE_KIND, unboxTapeEntry, unboxStatus } from './unbox-station-tape';

const AT = '2026-09-06T18:00:00.000Z';

test('a matched carton is the job: ok ground, PO as title and record', () => {
  const e = unboxTapeEntry(
    { id: 't1', tracking: '1Z999AA10123456784', status: 'matched', poLabel: 'PO 1234', receivingId: 42, lineCount: 3, verdict: 'normal' },
    AT,
  );
  assert.equal(e.verb, 'Matched');
  assert.equal(e.tone, 'ok');
  assert.equal(e.title, 'PO 1234');
  assert.equal(e.identifier, '1Z999AA10123456784');
  assert.equal(e.message, '3 lines');
  assert.equal(e.dedupeKey, 'carton:42');
  assert.equal(e.at, AT);
});

test('an expedited verdict paints warn and says Unbox first — the bench ranks by ground', () => {
  const e = unboxTapeEntry(
    { id: 't2', tracking: '1Z999AA10123456785', status: 'matched', poLabel: 'PO 1235', receivingId: 43, lineCount: 1, verdict: 'expedited' },
    AT,
  );
  assert.equal(e.verb, 'Unbox first');
  assert.equal(e.tone, 'warn');
});

test('unfound is the stop-work signal: warn, never bad — the box exists, the match does not', () => {
  const e = unboxTapeEntry(
    { id: 't3', tracking: '1Z999AA10123456786', status: 'unmatched', poLabel: null, receivingId: 44, lineCount: 0, verdict: 'unfound' },
    AT,
  );
  assert.equal(e.verb, 'Unfound');
  assert.equal(e.tone, 'warn');
  assert.equal(e.title, null);
});

test('a pending scan dedupes on tracking until the read mints a carton id', () => {
  const e = unboxTapeEntry(
    { id: 't4', tracking: '1Z999AA10123456787', status: 'pending', poLabel: null, receivingId: null, lineCount: 0, verdict: null },
    AT,
  );
  assert.equal(e.dedupeKey, 'tracking:1Z999AA10123456787');
  assert.equal(e.verb, 'Looking up');
});

test('the status line counts verdicts, not tape rows', () => {
  const s = unboxStatus([
    { status: 'matched', verdict: 'normal' },
    { status: 'matched', verdict: 'expedited' },
    { status: 'matched', verdict: 'normal' },
    { status: 'unmatched', verdict: 'unfound' },
    { status: 'pending', verdict: null },
  ]);
  assert.equal(s, '1 in flight · 1 first · 2 matched · 1 unfound');
  assert.equal(unboxStatus([]), 'Nothing scanned yet');
});

test('every label table entry exists for every status', () => {
  for (const status of ['pending', 'matched', 'unmatched', 'error'] as const) {
    assert.ok(UNBOX_TAPE_LABEL[status].verb);
  }
  assert.equal(UNBOX_DEDUPE_KIND, 'carton');
});
