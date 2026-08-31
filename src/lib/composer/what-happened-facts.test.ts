import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWhatHappenedFacts } from './what-happened-facts';
import type { OrderLinkage } from '@/lib/order-linkage';
import type { TimelineItem } from '@/lib/timeline/types';

const emptyLinkage: OrderLinkage = {
  matchedBy: null,
  order: null,
  trackings: [],
  serials: [],
  tickets: [],
};

test('buildWhatHappenedFacts prefers a replacement ship sentence', () => {
  const timeline: TimelineItem[] = [
    {
      id: '1',
      at: '2026-08-01T15:30:00.000Z',
      title: 'Warranty reship',
      subtitle: 'Replacement shipped',
    },
  ];
  const facts = buildWhatHappenedFacts({
    productTitle: 'Widget Pro',
    linkage: emptyLinkage,
    timeline,
  });
  assert.equal(facts[0]?.id, 'replacement-ship');
  assert.match(facts[0]!.sentence, /Shipped a replacement for Widget Pro/);
});

test('buildWhatHappenedFacts falls back to packed / tested stamps', () => {
  const facts = buildWhatHappenedFacts({
    productTitle: 'Lens',
    linkage: emptyLinkage,
    timeline: [],
    packedAt: '2026-08-10T12:00:00.000Z',
    testedAt: '2026-08-09T12:00:00.000Z',
  });
  assert.ok(facts.some((f) => f.id === 'packed'));
  assert.ok(facts.some((f) => f.id === 'tested'));
});

test('buildWhatHappenedFacts always returns at least one working fact', () => {
  const facts = buildWhatHappenedFacts({
    linkage: emptyLinkage,
    timeline: [],
  });
  assert.equal(facts.length, 1);
  assert.equal(facts[0]?.id, 'working');
});
