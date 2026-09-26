import type { AllocationHit, ChannelDisposition } from '@/lib/channel-allocation';

/** Ready-stage disposition facets on `/shipping/fba?fbaMode=ready` (`?rtab=`). */
export type ReadyWorkspaceTab = 'all' | 'fba' | 'prebox' | 'hold';

interface ReadyWorkspaceCounts {
  all: number;
  fba: number;
  prebox: number;
  hold: number;
  staged: number;
}

const READY_WORKSPACE_TAB_PARAM = 'rtab';
const VALID: ReadonlySet<string> = new Set(['all', 'fba', 'prebox', 'hold']);

export function getReadyWorkspaceTabFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): ReadyWorkspaceTab {
  const raw = String(searchParams.get(READY_WORKSPACE_TAB_PARAM) || '')
    .trim()
    .toLowerCase();
  return VALID.has(raw) ? (raw as ReadyWorkspaceTab) : 'all';
}

/** Wire tokens `?rtab=` may carry on FBA Ready (route-param hygiene). */
export function parseReadyWorkspaceTabWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return VALID.has(v) ? v : null;
}

export function normalizeReadyWorkspaceTabParams(
  params: URLSearchParams,
  preferredTab?: ReadyWorkspaceTab,
): ReadyWorkspaceTab {
  const nextTab = preferredTab ?? getReadyWorkspaceTabFromSearch(params);
  params.delete(READY_WORKSPACE_TAB_PARAM);
  if (nextTab !== 'all') params.set(READY_WORKSPACE_TAB_PARAM, nextTab);
  return nextTab;
}

export function readyTabDisposition(tab: ReadyWorkspaceTab): ChannelDisposition | null {
  if (tab === 'fba') return 'FBA';
  if (tab === 'prebox') return 'PREBOX_STOCK';
  if (tab === 'hold') return 'HOLD';
  return null;
}

/** Disposition tallies for the Ready KPI band — pure over the fetched hits. */
function readyHistoryCounts(hits: readonly AllocationHit[]): ReadyWorkspaceCounts {
  const next: ReadyWorkspaceCounts = { all: hits.length, fba: 0, prebox: 0, hold: 0, staged: 0 };
  for (const hit of hits) {
    if (hit.disposition === 'FBA') next.fba += 1;
    if (hit.disposition === 'PREBOX_STOCK') next.prebox += 1;
    if (hit.disposition === 'HOLD') next.hold += 1;
    if (hit.allocationState === 'FBA_STAGED') next.staged += 1;
  }
  return next;
}
