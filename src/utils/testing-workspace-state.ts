/**
 * Testing-mode workspace tabs on `/test?view=testing`.
 * Param: `?testTab=returns|pending|history` — absent defaults to Returns.
 */

export type TestingWorkspaceTab = 'pending' | 'returns' | 'history';

const TESTING_WORKSPACE_TAB_PARAM = 'testTab';

export const TESTING_WORKSPACE_TAB_LABEL: Record<TestingWorkspaceTab, string> = {
  pending: 'Pending',
  returns: 'Returns',
  history: 'History',
};

const VALID: ReadonlySet<string> = new Set(['pending', 'returns', 'history']);

export function getTestingWorkspaceTabFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): TestingWorkspaceTab {
  const raw = String(searchParams.get(TESTING_WORKSPACE_TAB_PARAM) || '')
    .trim()
    .toLowerCase();
  return VALID.has(raw) ? (raw as TestingWorkspaceTab) : 'returns';
}

/**
 * Normalize URL state for a Testing workbench tab switch.
 * Tab-specific search, layout, and staff filters never bleed across tables.
 */
export function normalizeTestingWorkspaceTabParams(
  params: URLSearchParams,
  preferredTab?: TestingWorkspaceTab,
): TestingWorkspaceTab {
  const nextTab = preferredTab ?? getTestingWorkspaceTabFromSearch(params);
  params.delete(TESTING_WORKSPACE_TAB_PARAM);

  if (nextTab !== 'history') {
    params.delete('staff');
    params.delete('layout');
    params.delete('weekOffset');
  }

  params.delete('search');

  if (nextTab !== 'returns') {
    params.set(TESTING_WORKSPACE_TAB_PARAM, nextTab);
  }
  return nextTab;
}
