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
  it('defaults missing ship param to urgent', () => {
    assert.equal(getShippingWorkspaceTabFromSearch(new URLSearchParams()), 'urgent');
  });

  it('reads urgent / all / history; legacy ship=fba falls to urgent', () => {
    assert.equal(
      getShippingWorkspaceTabFromSearch(new URLSearchParams('ship=fba')),
      'urgent',
    );
    assert.equal(
      getShippingWorkspaceTabFromSearch(new URLSearchParams('ship=urgent')),
      'urgent',
    );
    assert.equal(
      getShippingWorkspaceTabFromSearch(new URLSearchParams('ship=all')),
      'all',
    );
    assert.equal(
      getShippingWorkspaceTabFromSearch(new URLSearchParams('ship=history')),
      'history',
    );
  });

  it('omits ship param for urgent and clears queue filters when leaving', () => {
    const params = new URLSearchParams('ustatus=blocked&attention=1&surface=lanes');
    const tab = normalizeShippingWorkspaceTabParams(params, 'history');
    assert.equal(tab, 'history');
    assert.equal(params.get('ship'), 'history');
    assert.equal(params.has('ustatus'), false);
    assert.equal(params.has('attention'), false);
    assert.equal(params.has('surface'), false);
  });

  it('Urgent tab owns attention=1', () => {
    const params = new URLSearchParams();
    normalizeShippingWorkspaceTabParams(params, 'urgent');
    assert.equal(params.has('ship'), false);
    assert.equal(params.get('attention'), '1');
  });

  it('keeps an explicit Pending param so the Urgent default can be toggled off', () => {
    const params = new URLSearchParams('ship=urgent&attention=1');
    normalizeShippingWorkspaceTabParams(params, 'pending');
    assert.equal(params.get('ship'), 'pending');
    assert.equal(params.has('attention'), false);
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
