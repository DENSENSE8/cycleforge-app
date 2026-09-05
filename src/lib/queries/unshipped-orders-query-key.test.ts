import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { unshippedOrdersQueryKey } from './unshipped-orders-query-key';

describe('unshippedOrdersQueryKey', () => {
  it('puts blockedOnly on the default To-ship key so the seed can match the table', () => {
    const key = unshippedOrdersQueryKey({
      searchQuery: '',
      staffId: undefined,
      strictSearchScope: true,
      limit: 200,
    });
    assert.equal(key[0], 'dashboard-table');
    assert.equal(key[1], 'unshipped');
    assert.equal(key[2].blockedOnly, false);
    assert.equal(key[2].limit, 200);
    assert.equal(key[2].strictSearchScope, true);
  });

  it('does not share a cache entry between To-ship and the Pending (blocked) desk', () => {
    const toShip = unshippedOrdersQueryKey({
      strictSearchScope: true,
      limit: 200,
    });
    const pending = unshippedOrdersQueryKey({
      strictSearchScope: true,
      limit: 200,
      blockedOnly: true,
    });
    assert.notDeepEqual(toShip, pending);
    assert.equal(pending[2].blockedOnly, true);
  });
});
