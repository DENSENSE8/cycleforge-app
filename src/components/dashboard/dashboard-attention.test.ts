/**
 * Cross-domain attention band zoning.
 *
 * The band's whole claim is that it reads across BOTH domains at once, so the
 * cases that matter are: a zero never occupies a slot, severity decides the
 * order regardless of which domain a fact came from, and a missing source
 * degrades to "no facts from that side" rather than to zeros.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAttentionFacts } from './DashboardAttentionStrip';

const ids = (facts: ReturnType<typeof buildAttentionFacts>) => facts.map((f) => f.id);

test('zero counts never take a slot', () => {
  assert.deepEqual(
    buildAttentionFacts({
      inbound: { delivered_unopened: 0, delivered_not_unboxed: 0 },
      outbound: { urgent: 0, pending: 0 },
    }),
    [],
  );
});

test('severity orders across domains, not domain-then-severity', () => {
  const facts = buildAttentionFacts({
    inbound: { delivered_unopened: 3, delivered_not_unboxed: 9 },
    outbound: { urgent: 2, pending: 40 },
  });
  // dock(90) → urgent(85) → unbox(60) → pending(20): the two domains interleave,
  // which is the point — a grouped-by-domain order would just be two strips.
  assert.deepEqual(ids(facts), [
    'inbound-at-dock',
    'outbound-urgent',
    'inbound-to-unbox',
    'outbound-pending',
  ]);
  assert.deepEqual(
    facts.map((f) => f.domain),
    ['inbound', 'outbound', 'inbound', 'outbound'],
  );
});

test('a missing source contributes nothing (it does not read as zero-and-healthy)', () => {
  const outboundOnly = buildAttentionFacts({
    inbound: null,
    outbound: { urgent: 1, pending: 5 },
  });
  assert.deepEqual(ids(outboundOnly), ['outbound-urgent', 'outbound-pending']);

  const inboundOnly = buildAttentionFacts({
    inbound: { delivered_unopened: 4, delivered_not_unboxed: 0 },
    outbound: null,
  });
  assert.deepEqual(ids(inboundOnly), ['inbound-at-dock']);

  assert.deepEqual(buildAttentionFacts({ inbound: null, outbound: null }), []);
});

test('every fact links to a param /dashboard owns — never a retired one', () => {
  const facts = buildAttentionFacts({
    inbound: { delivered_unopened: 1, delivered_not_unboxed: 1 },
    outbound: { urgent: 1, pending: 1 },
  });
  for (const fact of facts) {
    const url = new URL(fact.href, 'https://example.test');
    assert.equal(url.pathname, '/dashboard', `${fact.id} must stay on the dashboard`);
    for (const key of url.searchParams.keys()) {
      assert.ok(
        ['mode', 'sort', 'unshipped', 'shipped'].includes(key),
        `${fact.id} writes '${key}', which /dashboard does not own`,
      );
    }
    assert.equal(url.searchParams.has('openOrderId'), false, 'a tile filters, never selects');
  }
});
