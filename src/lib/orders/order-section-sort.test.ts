import test from 'node:test';
import assert from 'node:assert/strict';

import type { RowGroup } from '@/lib/group-rows';
import type { ShippedOrder } from '@/types/orders';
import type { OrderStage } from '@/lib/orders/order-stages';
import { orderNextStep } from './order-card-model';
import { sortOrderSection } from './order-section-sort';

const group = (key: string, row: Partial<ShippedOrder>): RowGroup<ShippedOrder> => ({
  key,
  rows: [{ id: Number(key.replace(/\D/g, '')) || 1, ...row } as ShippedOrder],
});
const keys = (groups: RowGroup<ShippedOrder>[]) => groups.map((g) => g.key);

const A = group('a1', { created_at: '2026-09-01T10:00:00Z', ship_by_date: '2026-09-20T00:00:00Z', sale_amount: '10', account_source: 'ebay' });
const B = group('b2', { created_at: '2026-09-03T10:00:00Z', ship_by_date: '2026-09-18T00:00:00Z', sale_amount: '99', account_source: 'amazon' });
const C = group('c3', { created_at: null, ship_by_date: null, sale_amount: null, account_source: null });

test('a dated section runs soonest ship-by first; an undated one oldest order first; missing values last', () => {
  assert.deepEqual(keys(sortOrderSection([C, A, B], true)), ['b2', 'a1', 'c3']);
  assert.deepEqual(keys(sortOrderSection([C, A, B], false)), ['a1', 'b2', 'c3']);
});

const stage = (kind: OrderStage['kind'], done: boolean, extra: Partial<OrderStage> = {}): OrderStage => ({
  kind,
  label: kind,
  done,
  who: null,
  staffId: null,
  at: null,
  atShort: null,
  inherited: false,
  verdict: null,
  blocked: null,
  ...extra,
});

test('next step walks Pick → Pack → Scan out; the latest done stage wins', () => {
  const next = (pick: boolean, pack: boolean) => orderNextStep('ready', { pick: stage('pick', pick), pack: stage('pack', pack) }, false)?.label;
  assert.equal(next(false, false), 'Pick');
  assert.equal(next(true, false), 'Pack');
  assert.equal(next(true, true), 'Scan out');
  assert.equal(next(false, true), 'Scan out', 'a packed order waits on scan-out even with no recorded pick');
});

test('next step: blocked pick, counter pickup, shipped', () => {
  const blocked = orderNextStep('outOfStock', { pick: stage('pick', false, { blocked: 'out_of_stock' }), pack: stage('pack', false) }, false);
  assert.equal(blocked?.blocked, true);
  assert.equal(orderNextStep('packed', { pick: stage('pick', true), pack: stage('pack', true) }, true)?.label, 'Hand over');
  assert.equal(orderNextStep('shipped', { pick: stage('pick', true), pack: stage('pack', true) }, false), null);
});
