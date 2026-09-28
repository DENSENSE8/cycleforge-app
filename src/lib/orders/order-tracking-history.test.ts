import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTrackingHistory } from './order-tracking-history';

test('merges both sources newest first with reasons', () => {
  const out = mergeTrackingHistory(
    {
      replaced: [
        { previous: 'AAA111', next: 'BBB222', at: '2026-09-20T10:00:00Z', actor: 'Ana' },
        { previous: 'CCC333', next: null, at: '2026-09-22T10:00:00Z', actor: null },
      ],
      labels: [{ tracking: 'DDD444', status: 'voided', at: '2026-09-21T10:00:00Z', actor: 'Bo' }],
    },
    'EEE555',
  );
  assert.deepEqual(out.map((e) => [e.trackingNumber, e.reason, e.replacedBy]), [
    ['CCC333', 'unlinked', null],
    ['DDD444', 'voided', 'Bo'],
    ['AAA111', 'replaced', 'Ana'],
  ]);
});

test('never lists the current number, whitespace/case-insensitively', () => {
  const out = mergeTrackingHistory(
    { replaced: [{ previous: '1z 999', next: 'X', at: '2026-09-20T10:00:00Z', actor: null }], labels: [] },
    '1Z999',
  );
  assert.deepEqual(out, []);
});

test('a number that left twice appears once, at its latest departure', () => {
  const out = mergeTrackingHistory(
    {
      replaced: [{ previous: 'AAA', next: 'B', at: '2026-09-20T10:00:00Z', actor: 'old' }],
      labels: [{ tracking: 'AAA', status: 'voided', at: '2026-09-25T10:00:00Z', actor: 'new' }],
    },
    null,
  );
  assert.deepEqual(out, [{ trackingNumber: 'AAA', replacedAt: '2026-09-25T10:00:00Z', replacedBy: 'new', reason: 'voided' }]);
});

test('live label rows and blank numbers are ignored', () => {
  const out = mergeTrackingHistory(
    {
      replaced: [{ previous: '  ', next: 'B', at: '2026-09-20T10:00:00Z', actor: null }],
      labels: [
        { tracking: 'LIVE', status: 'purchased', at: '2026-09-20T10:00:00Z', actor: null },
        { tracking: null, status: 'voided', at: '2026-09-20T10:00:00Z', actor: null },
      ],
    },
    null,
  );
  assert.deepEqual(out, []);
});
