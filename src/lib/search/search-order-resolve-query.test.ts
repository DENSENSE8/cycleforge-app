import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import {
  normalizeSearchOrderResolveKey,
  searchOrderResolveByIdQueryKey,
  searchOrderResolveQueryKey,
  setSearchOrderResolveCache,
} from '@/lib/search/search-order-resolve-query';
import type { ShippedOrder } from '@/types/orders';

describe('search-order-resolve-query', () => {
  it('normalizes tokens for stable keys', () => {
    assert.equal(normalizeSearchOrderResolveKey('  01-14952  '), '01-14952');
    assert.equal(normalizeSearchOrderResolveKey(6057), '6057');
  });

  it('seeds token + numeric id aliases on ok', () => {
    const qc = new QueryClient();
    const order = { id: 42, order_id: '01-1', product_title: 'Widget' } as ShippedOrder;
    setSearchOrderResolveCache(qc, '01-1', { status: 'ok', order });

    assert.deepEqual(qc.getQueryData(searchOrderResolveQueryKey('01-1')), {
      status: 'ok',
      order,
    });
    assert.deepEqual(qc.getQueryData(searchOrderResolveByIdQueryKey(42)), {
      status: 'ok',
      order,
    });
    assert.deepEqual(qc.getQueryData(searchOrderResolveQueryKey('42')), {
      status: 'ok',
      order,
    });
  });
});
