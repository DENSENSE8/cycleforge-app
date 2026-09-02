import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTestRunId, hashPayload } from './test-run-id';

test('generateTestRunId is qa_YYYYMMDD_hex and unique', () => {
  const a = generateTestRunId(new Date('2026-09-01T12:00:00Z'));
  const b = generateTestRunId(new Date('2026-09-01T12:00:00Z'));
  assert.match(a, /^qa_20260901_[0-9a-f]{6}$/);
  assert.match(b, /^qa_20260901_[0-9a-f]{6}$/);
  assert.notEqual(a, b);
});

test('hashPayload is stable and short', () => {
  assert.equal(hashPayload({ a: 1 }), hashPayload({ a: 1 }));
  assert.notEqual(hashPayload({ a: 1 }), hashPayload({ a: 2 }));
  assert.equal(hashPayload({ a: 1 }).length, 16);
});
