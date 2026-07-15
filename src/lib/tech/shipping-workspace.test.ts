import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getShippingWorkspaceTabFromSearch,
  normalizeShippingWorkspaceTabParams,
} from '@/utils/shipping-workspace-state';
import {
  resolveShippingMetrics,
  ZERO_SHIPPING_FBA,
  ZERO_SHIPPING_HISTORY,
} from '@/lib/tech/shipping-metrics';

describe('shipping-workspace-state', () => {
  it('defaults missing ship param to pending', () => {
    assert.equal(getShippingWorkspaceTabFromSearch(new URLSearchParams()), 'pending');
  });

  it('reads ship=fba and ship=history', () => {
    assert.equal(
      getShippingWorkspaceTabFromSearch(new URLSearchParams('ship=fba')),
      'fba',
    );
    assert.equal(
      getShippingWorkspaceTabFromSearch(new URLSearchParams('ship=history')),
      'history',
    );
  });

  it('omits ship param for pending and clears pending filters when leaving', () => {
    const params = new URLSearchParams('ustatus=blocked&attention=1&surface=lanes');
    const tab = normalizeShippingWorkspaceTabParams(params, 'fba');
    assert.equal(tab, 'fba');
    assert.equal(params.get('ship'), 'fba');
    assert.equal(params.has('ustatus'), false);
    assert.equal(params.has('attention'), false);
    assert.equal(params.has('surface'), false);
  });

  it('clears staff when switching to fba', () => {
    const params = new URLSearchParams('staff=12&ship=history');
    normalizeShippingWorkspaceTabParams(params, 'fba');
    assert.equal(params.has('staff'), false);
  });
});

describe('shipping-metrics', () => {
  it('resolves pending blocked + ready tiles and drops zeros', () => {
    const metrics = resolveShippingMetrics({
      mode: 'pending',
      unshipped: { total: 10, pending: 0, tested: 4, blocked: 2 },
      fba: ZERO_SHIPPING_FBA,
      history: ZERO_SHIPPING_HISTORY,
    });
    assert.deepEqual(
      metrics.map((m) => m.id).sort(),
      ['blocked', 'ready'],
    );
  });

  it('resolves fba labeled and oos', () => {
    const metrics = resolveShippingMetrics({
      mode: 'fba',
      unshipped: { total: 0, pending: 0, tested: 0, blocked: 0 },
      fba: { planned: 0, tested: 0, packed: 0, outOfStock: 1, labeled: 3 },
      history: ZERO_SHIPPING_HISTORY,
    });
    assert.deepEqual(
      metrics.map((m) => m.id).sort(),
      ['fba-labeled', 'fba-oos'],
    );
  });
});
