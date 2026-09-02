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
import {
  buildTestingWorkspaceSearchParams,
  resolveTestingWorkspaceTesterId,
  testingWorkspaceEmptyCopy,
  testingWorkspaceQueryKey,
} from '@/lib/tech/testing-workspace-query';

describe('testing-workspace-state', () => {
  it('defaults to All and reads Urgent / Pending / Returns / History', () => {
    assert.equal(getTestingWorkspaceTabFromSearch(new URLSearchParams()), 'all');
    assert.equal(
      getTestingWorkspaceTabFromSearch(new URLSearchParams('testTab=urgent')),
      'urgent',
    );
    assert.equal(
      getTestingWorkspaceTabFromSearch(new URLSearchParams('testTab=pending')),
      'pending',
    );
    assert.equal(
      getTestingWorkspaceTabFromSearch(new URLSearchParams('testTab=all')),
      'all',
    );
    assert.equal(
      getTestingWorkspaceTabFromSearch(new URLSearchParams('testTab=history')),
      'history',
    );
  });

  it('omits the default param and clears tab-scoped state (staff persists across queue tabs)', () => {
    const params = new URLSearchParams(
      'testTab=history&staff=12&layout=board&weekOffset=2&search=bose',
    );
    normalizeTestingWorkspaceTabParams(params, 'all');
    assert.equal(params.has('testTab'), false);
    assert.equal(params.get('staff'), '12');
    assert.equal(params.has('layout'), false);
    assert.equal(params.has('weekOffset'), false);
    assert.equal(params.has('search'), false);
  });

  it('preserves staff across queue↔queue switches and keeps layout only on History', () => {
    const queue = new URLSearchParams('testTab=pending&staff=12');
    normalizeTestingWorkspaceTabParams(queue, 'urgent');
    assert.equal(queue.get('testTab'), 'urgent');
    assert.equal(queue.get('staff'), '12');

    const params = new URLSearchParams('staff=12&layout=board&weekOffset=2');
    normalizeTestingWorkspaceTabParams(params, 'history');
    assert.equal(params.get('testTab'), 'history');
    assert.equal(params.get('staff'), '12');
    assert.equal(params.get('layout'), 'board');
    assert.equal(params.get('weekOffset'), '2');
  });
});

describe('testing-workspace-query (body ↔ KPI twin)', () => {
  it('Option A: queue tabs treat absent staff as All; History defaults to Me', () => {
    assert.equal(
      resolveTestingWorkspaceTesterId({
        mode: 'pending',
        filteredStaffId: null,
        ownTesterId: 7,
        explicitlyAll: false,
      }),
      null,
    );
    assert.equal(
      resolveTestingWorkspaceTesterId({
        mode: 'pending',
        filteredStaffId: 12,
        ownTesterId: 7,
        explicitlyAll: false,
      }),
      12,
    );
    assert.equal(
      resolveTestingWorkspaceTesterId({
        mode: 'history',
        filteredStaffId: null,
        ownTesterId: 7,
        explicitlyAll: false,
      }),
      7,
    );
    assert.equal(
      resolveTestingWorkspaceTesterId({
        mode: 'history',
        filteredStaffId: null,
        ownTesterId: 7,
        explicitlyAll: true,
      }),
      null,
    );
  });

  it('query key + request params stay byte-identical for a given (tab, staff, search)', () => {
    const mode = 'urgent' as const;
    const testerId = 12;
    const search = 'bose';
    const weekOffset = 0;
    const priorityOnly = true;
    const key = testingWorkspaceQueryKey({
      mode,
      testerId,
      search,
      weekOffset,
      priorityOnly,
    });
    assert.deepEqual(key, ['testing-workspace', 'urgent', 12, 'bose', 0, true]);

    const params = buildTestingWorkspaceSearchParams({ mode, testerId, search });
    assert.equal(params.get('view'), 'needs-test');
    assert.equal(params.get('tester'), '12');
    assert.equal(params.get('return_scope'), 'all');
    assert.equal(params.get('priority_only'), '1');
    assert.equal(params.get('search'), 'bose');
  });

  it('distinguishes All-pool empty from Mine empty', () => {
    assert.match(
      testingWorkspaceEmptyCopy({
        mode: 'pending',
        testerId: null,
        ownTesterId: 7,
        explicitlyAll: false,
      }),
      /waiting for testing/i,
    );
    assert.match(
      testingWorkspaceEmptyCopy({
        mode: 'pending',
        testerId: 7,
        ownTesterId: 7,
        explicitlyAll: false,
      }),
      /assigned to you/i,
    );
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
