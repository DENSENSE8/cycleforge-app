/**
 * Quality Control workbench tabs on `/test`.
 * Param: `?testTab=urgent|returns|pending|all|history` — absent defaults to Returns.
 */

export type TestingWorkspaceTab =
  | 'urgent'
  | 'returns'
  | 'pending'
  | 'all'
  | 'history';

const TESTING_WORKSPACE_TAB_PARAM = 'testTab';

/** Band-1 order — Urgent · Returns · Pending · All · History. */
const TESTING_WORKSPACE_TABS: readonly TestingWorkspaceTab[] = [
  'urgent',
  'returns',
  'pending',
  'all',
  'history',
] as const;

const TESTING_WORKSPACE_TAB_LABEL: Record<TestingWorkspaceTab, string> = {
  urgent: 'Urgent',
  returns: 'Returns',
  pending: 'Pending',
  all: 'All',
  history: 'History',
};

const VALID: ReadonlySet<string> = new Set(TESTING_WORKSPACE_TABS);

/** Raw-string form of {@link getTestingWorkspaceTabFromSearch}, for callers that hold a value rather than a `URLSearchParams` — notably the… */
export function parseTestingWorkspaceTab(raw: string | null): TestingWorkspaceTab {
  const value = String(raw || '').trim().toLowerCase();
  return VALID.has(value) ? (value as TestingWorkspaceTab) : 'returns';
}

export function getTestingWorkspaceTabFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): TestingWorkspaceTab {
  return parseTestingWorkspaceTab(searchParams.get(TESTING_WORKSPACE_TAB_PARAM));
}

/** Normalize URL state for a Testing workbench tab switch. */
export function normalizeTestingWorkspaceTabParams(
  params: URLSearchParams,
  preferredTab?: TestingWorkspaceTab,
): TestingWorkspaceTab {
  const nextTab = preferredTab ?? getTestingWorkspaceTabFromSearch(params);
  params.delete(TESTING_WORKSPACE_TAB_PARAM);

  if (nextTab !== 'history') {
    params.delete('layout');
    params.delete('weekOffset');
  }

  params.delete('search');

  if (nextTab !== 'returns') {
    params.set(TESTING_WORKSPACE_TAB_PARAM, nextTab);
  }
  return nextTab;
}
