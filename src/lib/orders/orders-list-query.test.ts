import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodeOrdersListCursor,
  ordersListCacheLookupKey,
  parseOrdersListQuery,
  type OrdersListQuery,
} from './orders-list-query';

const ORG = '00000000-0000-0000-0000-000000000001';
const QUEUE = 'inWarehouse=true&listShape=queue';

function keyFor(qs: string, org = ORG): string {
  return ordersListCacheLookupKey(org, parseOrdersListQuery(new URLSearchParams(qs)));
}

test('two pages that differ only by limit never share a cache entry', () => {
  assert.notEqual(keyFor(`${QUEUE}&limit=30`), keyFor(`${QUEUE}&limit=3`));
  assert.notEqual(keyFor(`${QUEUE}&limit=30`), keyFor(QUEUE));
});

test('two pages that differ only by cursor never share a cache entry', () => {
  const first = keyFor(`${QUEUE}&limit=30`);
  const page2 = keyFor(`${QUEUE}&limit=30&cursor=${encodeOrdersListCursor({ d: '2026-09-20T00:00:00.000Z', id: 41 })}`);
  const page3 = keyFor(`${QUEUE}&limit=30&cursor=${encodeOrdersListCursor({ d: '2026-09-20T00:00:00.000Z', id: 97 })}`);
  const nullDeadline = keyFor(`${QUEUE}&limit=30&cursor=${encodeOrdersListCursor({ d: null, id: 41 })}`);
  assert.equal(new Set([first, page2, page3, nullDeadline]).size, 4);
});

test('a malformed cursor reads as the first page', () => {
  assert.equal(keyFor(`${QUEUE}&limit=30&cursor=not-base64-json`), keyFor(`${QUEUE}&limit=30`));
});

test('param order and irrelevant params do not split the cache', () => {
  assert.equal(keyFor(`limit=30&${QUEUE}`), keyFor(`${QUEUE}&limit=30`));
  assert.equal(keyFor(`${QUEUE}&limit=30&utm=x`), keyFor(`${QUEUE}&limit=30`));
});

test('the organization is part of the key', () => {
  assert.notEqual(keyFor(QUEUE, ORG), keyFor(QUEUE, '00000000-0000-0000-0000-000000000002'));
});

/** A value of the field's type that differs from the current one. */
function perturb(field: keyof OrdersListQuery, value: OrdersListQuery[keyof OrdersListQuery]) {
  if (field === 'cursor') return value ? null : { d: null, id: 12345 };
  if (field === 'pageLimit' || field === 'staffFilterId') return value === 7 ? 8 : 7;
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'number') return Number.isNaN(value) ? 7 : value + 1;
  if (typeof value === 'string') return `${value}x`;
  return 'x';
}

test('every parsed field participates in the key, so a new param cannot be forgotten', () => {
  const base = parseOrdersListQuery(new URLSearchParams(`${QUEUE}&limit=30`));
  const baseKey = ordersListCacheLookupKey(ORG, base);
  for (const field of Object.keys(base) as (keyof OrdersListQuery)[]) {
    const variant = { ...base, [field]: perturb(field, base[field]) } as OrdersListQuery;
    assert.notEqual(ordersListCacheLookupKey(ORG, variant), baseKey, `field ${field} is not in the cache key`);
  }
});
