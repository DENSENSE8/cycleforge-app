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
import { resolveOrdersHoldValue } from '@/lib/tables/field-catalog/orders-resolve';
import { VIEW_SORT_ARRANGE } from '@/components/outbound/orders/view-sort';
import type { ShippedOrder } from '@/types/orders';

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

test('the pairing form and the Resolve verb are the Exceptions view alone', () => {
  for (const key of ALL_KEYS) {
    const exceptions = key === 'shipping.exceptions';
    assert.equal((VIEW_SPECS[key].record as readonly string[]).includes('resolve'), exceptions, `${key}: resolve section`);
    assert.equal(viewOffersVerb(key, 'resolve'), exceptions, `${key}: resolve verb`);
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
  assert.equal(viewDensity('shipping.exceptions', 'L'), 'M');
  assert.equal(viewDensity('shipping.to-ship', 'L'), 'L');
  assert.equal(viewDensity('shipping.to-ship', 'XL'), 'M');
  assert.equal(viewDensity('shipping.to-ship', undefined), 'M');
});

function heldRow(id: number, hold: ShippedOrder['hold']): ShippedOrder {
  return { id, order_id: `O-${id}`, hold } as unknown as ShippedOrder;
}

test('held facts: releases counts the order plus its unpaired siblings; a row that is not held has none', () => {
  const row = heldRow(1, {
    category: 'SKU Mapping',
    owner: 'Inventory / Accounting',
    action: 'Pair to an existing inventory item',
    blockers: ['unpaired'],
    siblingUnpairedCount: 3,
  });
  assert.deepEqual(resolveOrdersHoldValue(row, 'orders.hold_releases'), { kind: 'hold-releases', count: 4, face: '4 orders' });
  assert.deepEqual(resolveOrdersHoldValue(row, 'orders.hold_fix'), {
    kind: 'hold-fix',
    missing: ['Unpaired SKU'],
    action: 'Pair to an existing inventory item',
  });
  assert.equal(resolveOrdersHoldValue(heldRow(2, null), 'orders.hold_reason'), null);
});

test('the Exceptions sort puts a missing item number first, then the widest release', () => {
  const hold = (blockers: ('unpaired' | 'no_item_number')[], siblingUnpairedCount: number) => ({
    category: 'SKU Mapping',
    owner: 'Inventory / Accounting',
    action: 'x',
    blockers,
    siblingUnpairedCount,
  });
  const group = (row: ShippedOrder) => ({ key: String(row.id), rows: [row] });
  const arrange = VIEW_SORT_ARRANGE[VIEW_SPECS['shipping.exceptions'].sort]!;
  const out = arrange([
    ['2026-09-01', [group(heldRow(10, hold(['unpaired'], 0))), group(heldRow(11, hold(['unpaired'], 5)))]],
    ['2026-09-02', [group(heldRow(12, hold(['no_item_number'], 0)))]],
  ]);
  assert.equal(out.length, 1, 'one flat section, not ship-by days');
  assert.deepEqual(out[0]![1].map((g) => g.rows[0]!.id), [12, 11, 10]);
  assert.equal(VIEW_SORT_ARRANGE[VIEW_SPECS['shipping.to-ship'].sort], undefined, 'To ship keeps the feed sort');
});
