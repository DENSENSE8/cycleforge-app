import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseExcludeLineIdParam } from './exclude-line-id-param';

test('parseExcludeLineIdParam accepts missing or a positive id', () => {
  assert.deepEqual(parseExcludeLineIdParam(new URLSearchParams()), {
    ok: true,
    excludeLineId: null,
  });
  assert.deepEqual(
    parseExcludeLineIdParam(new URLSearchParams('excludeLineId=12')),
    { ok: true, excludeLineId: 12 },
  );
});

test('parseExcludeLineIdParam rejects non-positive ids', () => {
  assert.equal(
    parseExcludeLineIdParam(new URLSearchParams('excludeLineId=0')).ok,
    false,
  );
  assert.equal(
    parseExcludeLineIdParam(new URLSearchParams('excludeLineId=-3')).ok,
    false,
  );
  assert.equal(
    parseExcludeLineIdParam(new URLSearchParams('excludeLineId=nope')).ok,
    false,
  );
});
