/**
 * Shared Testing workbench list/KPI query contract.
 *
 * Body (`TestingHistoryList`) and KPI strip (`TestingKpiStrip`) MUST issue the
 * same React Query key + request params for a given (tab, staff, search) so the
 * 500-row feed dedupes and counts never disagree with rows.
 */

import type { TestingWorkspaceTab } from '@/utils/testing-workspace-state';

export function resolveTestingWorkspaceTesterId(args: {
  mode: TestingWorkspaceTab;
  filteredStaffId: number | null;
  ownTesterId: number | null;
  explicitlyAll: boolean;
}): number | null {
  const { mode, filteredStaffId, ownTesterId, explicitlyAll } = args;
  if (mode === 'history') {
    // History defaults to Me when `?staff=` is absent (allToken convention).
    return explicitlyAll ? null : (filteredStaffId ?? ownTesterId);
  }
  // Queue tabs (Option A): absent `?staff=` = whole pool; positive id scopes.
  return filteredStaffId;
}

export function testingWorkspaceQueryKey(args: {
  mode: TestingWorkspaceTab;
  testerId: number | null;
  search: string;
  weekOffset: number;
  priorityOnly: boolean;
}): readonly [string, TestingWorkspaceTab, number | 'all', string, number, boolean] {
  return [
    'testing-workspace',
    args.mode,
    args.testerId ?? 'all',
    args.search,
    args.weekOffset,
    args.priorityOnly,
  ] as const;
}

export function buildTestingWorkspaceSearchParams(args: {
  mode: TestingWorkspaceTab;
  testerId: number | null;
  search: string;
  weekStart?: string;
  weekEnd?: string;
}): URLSearchParams {
  const { mode, testerId, search } = args;
  const view = mode === 'history' ? 'testing' : 'needs-test';
  const params = new URLSearchParams({
    limit: '500',
    offset: '0',
    include: 'serials',
    view,
  });
  if (testerId != null) params.set('tester', String(testerId));
  if (view === 'needs-test') {
    params.set(
      'return_scope',
      mode === 'returns' ? 'returns' : mode === 'pending' ? 'standard' : 'all',
    );
    if (mode === 'urgent') params.set('priority_only', '1');
  }
  if (view === 'testing' && args.weekStart && args.weekEnd) {
    params.set('weekStart', args.weekStart);
    params.set('weekEnd', args.weekEnd);
  }
  if (search) params.set('search', search);
  return params;
}

/** Empty-state copy for queue / history — distinguishes All-pool vs Mine scope. */
export function testingWorkspaceEmptyCopy(args: {
  mode: TestingWorkspaceTab;
  testerId: number | null;
  ownTesterId: number | null;
  explicitlyAll: boolean;
}): string {
  const { mode, testerId, ownTesterId, explicitlyAll } = args;
  if (mode === 'history') {
    if (ownTesterId == null && !explicitlyAll) return 'Sign in to see tested lines.';
    return 'No tested lines in this staff scope yet.';
  }
  if (testerId != null) {
    return testerId === ownTesterId
      ? 'No tests are assigned to you. Switch to All to pick up unassigned work.'
      : 'No tests are assigned to this technician. Switch to All to see the full pool.';
  }
  switch (mode) {
    case 'urgent':
      return 'No priority lines are waiting for testing.';
    case 'pending':
      return 'No standard intake is waiting for testing.';
    case 'returns':
      return 'No returns are waiting for quality control.';
    case 'all':
      return 'No lines are waiting for testing.';
    default:
      return 'No lines are waiting for testing.';
  }
}
