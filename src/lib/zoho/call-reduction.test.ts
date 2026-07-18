import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeTrackingKey,
  pickMirrorPoIdFromCandidates,
  shouldSkipPoDetailFetch,
} from './call-reduction';

test('shouldSkipPoDetailFetch: skips only when local lines match list stamp', () => {
  assert.equal(
    shouldSkipPoDetailFetch({
      listLastModified: '2026-07-01T12:00:00-0700',
      localLineCount: 2,
      localMaxLastModified: '2026-07-01T12:00:00-0700',
    }),
    true,
  );
  assert.equal(
    shouldSkipPoDetailFetch({
      listLastModified: '2026-07-01T12:00:00-0700',
      localLineCount: 2,
      localMaxLastModified: '2026-07-01T11:00:00-0700',
    }),
    false,
  );
  assert.equal(
    shouldSkipPoDetailFetch({
      listLastModified: '2026-07-01T12:00:00-0700',
      localLineCount: 0,
      localMaxLastModified: '2026-07-01T12:00:00-0700',
    }),
    false,
  );
  assert.equal(
    shouldSkipPoDetailFetch({
      listLastModified: null,
      localLineCount: 3,
      localMaxLastModified: 'x',
    }),
    false,
  );
});

test('canonicalizeTrackingKey strips non-alnum', () => {
  assert.equal(canonicalizeTrackingKey('1Z999 AA1 01'), '1Z999AA101');
  assert.equal(canonicalizeTrackingKey(null), '');
});

test('pickMirrorPoIdFromCandidates prefers unique exact, else unique suffix', () => {
  assert.equal(
    pickMirrorPoIdFromCandidates({ exactPoIds: ['a'], suffixPoIds: ['b', 'c'] }),
    'a',
  );
  assert.equal(
    pickMirrorPoIdFromCandidates({ exactPoIds: [], suffixPoIds: ['b'] }),
    'b',
  );
  assert.equal(
    pickMirrorPoIdFromCandidates({ exactPoIds: ['a', 'a2'], suffixPoIds: ['b'] }),
    null,
  );
  assert.equal(
    pickMirrorPoIdFromCandidates({ exactPoIds: [], suffixPoIds: ['b', 'c'] }),
    null,
  );
});
