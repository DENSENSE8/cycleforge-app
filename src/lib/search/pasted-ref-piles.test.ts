import test from 'node:test';
import assert from 'node:assert/strict';
import type { NavLocateEntry } from '@/lib/nav/context/schema';
import { comparePastedRefs, pastedRefPile, pastedRefPileLabel } from './pasted-ref-piles';

function entry(ref: string, buckets: string[], facet: string | null = null): NavLocateEntry {
  return {
    ref,
    buckets,
    title: null,
    detail: null,
    recordHref: null,
    facet: facet ? { id: facet, label: facet } : null,
  };
}

test('one pile, needs-a-person first, bucket labels only', () => {
  const rows = [
    entry('QUIET', ['inbound:received'], 'unboxed'),
    entry('SOLD', ['outbound:triage', 'outbound:exceptions'], 'no_match'),
    entry('DIRT', ['inbound:not_received'], 'erp_ahead'),
    entry('WAIT', ['inbound:awaiting_tracking', 'inbound:not_received'], 'in_transit'),
    entry('GONE', ['outbound:shipped']),
    entry('MISS', []),
    entry('TRANSIT', ['inbound:not_received'], 'in_transit'),
  ];
  assert.deepEqual(rows.map((row) => pastedRefPile(row)), [
    'quiet',
    'triage',
    'exceptions',
    'awaiting_tracking',
    'quiet',
    'rest',
    'rest',
  ]);
  const order = new Map(rows.map((row, index) => [row.ref, index]));
  assert.deepEqual(
    [...rows].sort((a, b) => comparePastedRefs(a, b, order)).map((row) => row.ref),
    ['WAIT', 'DIRT', 'SOLD', 'MISS', 'TRANSIT', 'QUIET', 'GONE'],
  );
  const buckets = [
    { id: 'inbound:awaiting_tracking', label: 'Receiving · Awaiting tracking', tone: 'warning' as const, href: '/incoming?state=AWAITING_TRACKING', count: 1 },
    { id: 'inbound:exceptions', label: 'Receiving · Exceptions', tone: 'danger' as const, href: '/incoming?lane=exceptions', count: 1 },
    { id: 'outbound:triage', label: 'Fulfillment · Allocate', tone: 'neutral' as const, href: '/shipping/orders', count: 1 },
    { id: 'inbound:received', label: 'Receiving · Received', tone: 'success' as const, href: null, count: 1 },
    { id: 'outbound:shipped', label: 'Fulfillment · Shipped', tone: 'success' as const, href: '/fulfilled', count: 1 },
  ];
  assert.equal(pastedRefPileLabel('awaiting_tracking', buckets, rows), 'Receiving · Awaiting tracking');
  assert.equal(pastedRefPileLabel('triage', buckets, rows), 'Fulfillment · Allocate');
  assert.equal(pastedRefPileLabel('quiet', buckets, rows), 'Receiving · Received');
});
