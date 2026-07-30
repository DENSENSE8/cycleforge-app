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

/**
 * Raw-string form of {@link getTestingWorkspaceTabFromSearch}, for callers that
 * hold a value rather than a `URLSearchParams` — notably the `/test` param spec
 * (`@/lib/routing/query-mode-routes`), which composes this via `paramRoundTrip`
 * so the route contract cannot drift from `VALID`.
 */
export function parseTestingWorkspaceTab(raw: string | null): TestingWorkspaceTab {
  const value = String(raw || '').trim().toLowerCase();
  return VALID.has(value) ? (value as TestingWorkspaceTab) : 'returns';
}

export function getTestingWorkspaceTabFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): TestingWorkspaceTab {
  return parseTestingWorkspaceTab(searchParams.get(TESTING_WORKSPACE_TAB_PARAM));
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
