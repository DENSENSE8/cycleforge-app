import assert from 'node:assert/strict';
import test from 'node:test';
import { takeReasonPayload } from './take-reason';

test('refuses an unclassified stock take', () => {
  assert.deepEqual(takeReasonPayload(null), { ok: false, error: 'Choose why this stock is leaving' });
});

test('requires words for custom and preserves the closed reason vocabulary', () => {
  assert.equal(takeReasonPayload({ code: 'TAKE_CUSTOM', custom: '' }).ok, false);
  assert.deepEqual(takeReasonPayload({ code: 'TAKE_DAMAGED', custom: '' }), {
    ok: true,
    reason: 'TAKE_DAMAGED',
    notes: null,
  });
  assert.deepEqual(takeReasonPayload({ code: 'TAKE_CUSTOM', custom: ' crushed box ' }), {
    ok: true,
    reason: 'TAKE_CUSTOM',
    notes: 'crushed box',
  });
});
