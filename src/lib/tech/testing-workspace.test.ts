import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getTestingWorkspaceTabFromSearch,
  normalizeTestingWorkspaceTabParams,
} from '@/utils/testing-workspace-state';
import {
  resolveTestingMetrics,
  ZERO_TESTING_HISTORY,
  ZERO_TESTING_QUEUE,
} from '@/lib/tech/testing-metrics';

describe('testing-workspace-state', () => {
  it('defaults to Returns and reads Pending / History', () => {
    assert.equal(getTestingWorkspaceTabFromSearch(new URLSearchParams()), 'returns');
    assert.equal(
      getTestingWorkspaceTabFromSearch(new URLSearchParams('testTab=pending')),
      'pending',
    );
    assert.equal(
      getTestingWorkspaceTabFromSearch(new URLSearchParams('testTab=history')),
      'history',
    );
  });

  it('omits the default param and clears tab-scoped state', () => {
    const params = new URLSearchParams(
      'testTab=history&staff=12&layout=board&weekOffset=2&search=bose',
    );
    normalizeTestingWorkspaceTabParams(params, 'returns');
    assert.equal(params.has('testTab'), false);
    assert.equal(params.has('staff'), false);
    assert.equal(params.has('layout'), false);
    assert.equal(params.has('weekOffset'), false);
    assert.equal(params.has('search'), false);
  });

  it('preserves staff and layout only on History', () => {
    const params = new URLSearchParams('staff=12&layout=board&weekOffset=2');
    normalizeTestingWorkspaceTabParams(params, 'history');
    assert.equal(params.get('testTab'), 'history');
    assert.equal(params.get('staff'), '12');
    assert.equal(params.get('layout'), 'board');
    assert.equal(params.get('weekOffset'), '2');
  });
});

describe('testing-metrics', () => {
  it('resolves attention-first queue metrics', () => {
    const metrics = resolveTestingMetrics({
      mode: 'pending',
      queue: {
        total: 12,
        assignedToMe: 3,
        unassigned: 4,
        oldestAgeHours: 26,
        platformCount: 0,
      },
      history: ZERO_TESTING_HISTORY,
    });
    assert.deepEqual(
      metrics.map((metric) => metric.id),
      ['queue-depth', 'oldest', 'mine', 'unassigned'],
    );
  });

  it('resolves testing throughput and outcome metrics', () => {
    const metrics = resolveTestingMetrics({
      mode: 'history',
      queue: ZERO_TESTING_QUEUE,
      history: { weekTotal: 18, todayTotal: 4, failed: 2, retest: 1 },
    });
    assert.deepEqual(
      metrics.map((metric) => metric.id),
      ['tested-today', 'tested-week', 'failed', 'retest'],
    );
  });
});
