import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DENSITIES,
  ORDER_LIST_VIEW_KEYS,
  VIEW_SPECS,
  rowFactsAt,
  viewDensity,
  viewOffersVerb,
  type OrderViewKey,
} from './view-specs';
import { ORDERS_FACT_IDS } from '@/lib/tables/field-catalog/orders';
import { ORDER_VERB_IDS } from '@/lib/orders/order-verbs';

const ALL_KEYS = Object.keys(VIEW_SPECS) as OrderViewKey[];

test('every list view names only field-catalog facts, and its lead paints at every density', () => {
  for (const key of ORDER_LIST_VIEW_KEYS) {
    const spec = VIEW_SPECS[key];
    for (const { fact } of spec.rowFacts) assert.ok(ORDERS_FACT_IDS.has(fact), `${key}: ${fact} is not a catalog fact`);
    assert.ok(ORDERS_FACT_IDS.has(spec.lead), `${key}: lead ${spec.lead} is not a catalog fact`);
    for (const density of DENSITIES) {
      assert.ok(rowFactsAt(key, density).includes(spec.lead), `${key}: lead missing at ${density}`);
    }
    const facts = spec.rowFacts.map((f) => f.fact);
    assert.equal(new Set(facts).size, facts.length, `${key}: a fact is listed twice`);
  }
});

test('every view names only registered verbs, with one primary not repeated as secondary', () => {
  const known = new Set<string>(ORDER_VERB_IDS);
  for (const key of ALL_KEYS) {
    const { primary, secondary, bulk } = VIEW_SPECS[key].verbs;
    for (const verb of [primary, ...secondary, ...bulk]) assert.ok(known.has(verb), `${key}: unknown verb ${verb}`);
    assert.ok(!secondary.includes(primary), `${key}: primary ${primary} repeated as secondary`);
  }
});

test('no order view carries the pairing form or the Resolve verb — the Exceptions hub owns them', () => {
  for (const key of ALL_KEYS) {
    assert.equal((VIEW_SPECS[key].record as readonly string[]).includes('resolve'), false, `${key}: resolve section`);
    assert.equal(viewOffersVerb(key, 'resolve'), false, `${key}: resolve verb`);
    const sections = VIEW_SPECS[key].record;
    assert.equal(new Set(sections).size, sections.length, `${key}: a section is listed twice`);
  }
  // The archive keeps no work verbs: a shipped order is not reported short or marked urgent.
  assert.equal(viewOffersVerb('shipping.shipped', 'out-of-stock'), false);
  assert.equal(viewOffersVerb('shipping.shipped', 'urgent'), false);
});

test('densities disclose more as they grow, and a stored density is clamped to the view', () => {
  for (const key of ORDER_LIST_VIEW_KEYS) {
    const { density } = VIEW_SPECS[key];
    assert.ok(density.allowed.includes(density.default), `${key}: default outside allowed`);
    const [s, m, l] = DENSITIES.map((d) => new Set(rowFactsAt(key, d)));
    for (const fact of s!) assert.ok(m!.has(fact), `${key}: ${fact} at S but not M`);
    for (const fact of m!) assert.ok(l!.has(fact), `${key}: ${fact} at M but not L`);
  }
  assert.equal(viewDensity('shipping.to-ship', 'L'), 'L');
  assert.equal(viewDensity('shipping.to-ship', 'XL'), 'M');
  assert.equal(viewDensity('shipping.to-ship', undefined), 'M');
});
