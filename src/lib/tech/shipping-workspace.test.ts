import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getShippingWorkspaceTabFromSearch,
  normalizeShippingWorkspaceTabParams,
} from '@/utils/shipping-workspace-state';
import {
  resolveShippingMetrics,
  ZERO_SHIPPING_HISTORY,
} from '@/lib/tech/shipping-metrics';

describe('shipping-workspace-state', () => {
  it('defaults missing ship param to pending', () => {
    assert.equal(getShippingWorkspaceTabFromSearch(new URLSearchParams()), 'pending');
  });

  it('reads ship=history; legacy ship=fba falls to pending', () => {
    assert.equal(
      getShippingWorkspaceTabFromSearch(new URLSearchParams('ship=fba')),
      'pending',
    );
    assert.equal(
      getShippingWorkspaceTabFromSearch(new URLSearchParams('ship=history')),
      'history',
    );
  });

  it('omits ship param for pending and clears pending filters when leaving', () => {
    const params = new URLSearchParams('ustatus=blocked&attention=1&surface=lanes');
    const tab = normalizeShippingWorkspaceTabParams(params, 'history');
    assert.equal(tab, 'history');
    assert.equal(params.get('ship'), 'history');
    assert.equal(params.has('ustatus'), false);
    assert.equal(params.has('attention'), false);
    assert.equal(params.has('surface'), false);
  });
});

describe('shipping-metrics', () => {
  it('resolves pending blocked + ready tiles and drops zeros', () => {
    const metrics = resolveShippingMetrics({
      mode: 'pending',
      unshipped: { total: 10, pending: 0, tested: 4, blocked: 2 },
      history: ZERO_SHIPPING_HISTORY,
    });
    assert.deepEqual(
      metrics.map((m) => m.id).sort(),
      ['blocked', 'ready'],
    );
  });
});
