/**
 * Triage (Arrival) workbench tabs on `/triage` — URL SoT via `?triview=`.
 * Absent param defaults to Triage (`triage`).
 */

export type TriageWorkspaceTab = 'triage' | 'found' | 'unfound' | 'done';

const TRIAGE_VIEW_PARAM = 'triview';

const VALID: ReadonlySet<string> = new Set(['triage', 'found', 'unfound', 'done']);

export function resolveTriageView(raw: string | null | undefined): TriageWorkspaceTab {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  return VALID.has(value) ? (value as TriageWorkspaceTab) : 'triage';
}

export function getTriageWorkspaceTabFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): TriageWorkspaceTab {
  return resolveTriageView(searchParams.get(TRIAGE_VIEW_PARAM));
}

/**
 * Normalize URL state for a Triage workbench tab switch.
 * `triage` omits the param (clean URL); other tabs set `triview`.
 */
export function normalizeTriageWorkspaceTabParams(
  params: URLSearchParams,
  preferredTab?: TriageWorkspaceTab,
): TriageWorkspaceTab {
  const nextTab = preferredTab ?? getTriageWorkspaceTabFromSearch(params);
  if (nextTab === 'triage') params.delete(TRIAGE_VIEW_PARAM);
  else params.set(TRIAGE_VIEW_PARAM, nextTab);
  return nextTab;
}
