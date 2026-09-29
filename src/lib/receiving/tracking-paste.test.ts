/**
 * The paste vocabulary — one splitter, two policies at the cap.
 *
 * Run: `npx tsx --test src/lib/receiving/tracking-paste.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHECK_ZOHO_RECEIVED_MAX_INPUTS,
  parseTrackingInParam,
  parseTrackingKeys,
  parseTrackingPaste,
  serializeTrackingIn,
} from './tracking-paste';

test('one splitter: the key selection agrees with the check parser on the same blob', () => {
  const blob = '1Z999 AA1 01\n9400111899223344556677, 1Z999-AA1-01';
  const check = parseTrackingPaste(blob);
  const keys = parseTrackingKeys(blob);
  assert.equal(check.ok, true);
  assert.deepEqual(
    keys.display,
    check.ok ? check.trackings : [],
    'both surfaces must split and dedupe a paste identically',
  );
});

test('keys are canonical and deduped by canon, not by literal', () => {
  const sel = parseTrackingKeys('1z999-aa1 01\n1Z999AA101\n  \n,,');
  assert.deepEqual(sel.keys, ['1Z999AA101']);
  assert.equal(sel.requested, 1);
  assert.equal(sel.truncated, 0);
});

test('the cap TRUNCATES for the filter where it ERRORS for the check', () => {
  // Same paste, two policies, on purpose: every key past the cap is an
  // unanswered ERP lookup, but the list can honestly show the first N.
  const requested = CHECK_ZOHO_RECEIVED_MAX_INPUTS + 37;
  const many = Array.from({ length: requested }, (_, i) => `TRACK${String(i).padStart(6, '0')}`).join('\n');

  const check = parseTrackingPaste(many);
  assert.equal(check.ok, false, 'the ERP check refuses an oversize paste');

  const sel = parseTrackingKeys(many);
  assert.equal(sel.keys.length, CHECK_ZOHO_RECEIVED_MAX_INPUTS);
  assert.equal(sel.requested, requested);
  assert.equal(sel.truncated, 37, 'truncation is REPORTED, never swallowed');
});

test('an empty or junk paste yields an empty selection, never a throw', () => {
  for (const input of ['', '   ', ',,;\n\n', '!!!']) {
    const sel = parseTrackingKeys(input);
    assert.deepEqual(sel.keys, []);
    assert.equal(sel.truncated, 0);
  }
});

test('short order/PO numbers survive the splitter', () => {
  const parsed = parseTrackingPaste('PO-99\n12-14721-26664');
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.trackings, ['PO-99', '12-14721-26664']);
  assert.deepEqual(parseTrackingKeys('PO-99\n12-14721-26664').keys, ['PO99', '121472126664']);
});

test('empty paste error names tracking or order numbers', () => {
  const empty = parseTrackingPaste('  , \n');
  assert.equal(empty.ok, false);
  if (empty.ok) return;
  assert.match(empty.error, /tracking or order number/i);
});

test('the URL param round-trips', () => {
  const sel = parseTrackingKeys('1Z999AA101, 9400111899223344556677');
  const param = serializeTrackingIn(sel.keys);
  assert.equal(param, '1Z999AA101,9400111899223344556677');
  assert.deepEqual(parseTrackingInParam(param).keys, sel.keys);
});

test('a hand-edited deep link degrades instead of breaking the page', () => {
  assert.deepEqual(parseTrackingInParam(null).keys, []);
  assert.deepEqual(parseTrackingInParam('').keys, []);
  // Over-cap in the URL is truncated server-side rather than 400-ing.
  const many = Array.from({ length: 210 }, (_, i) => `T${String(i).padStart(9, '0')}`).join(',');
  assert.equal(parseTrackingInParam(many).keys.length, CHECK_ZOHO_RECEIVED_MAX_INPUTS);
});
