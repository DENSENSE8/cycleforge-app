import type { ChannelDisposition } from '@/lib/channel-allocation';

/** Ready-workbench facets nested under the outbound Ready sidebar mode. */
export type ReadyWorkspaceTab = 'all' | 'fba' | 'prebox' | 'hold';

export const READY_WORKSPACE_TAB_LABEL: Record<ReadyWorkspaceTab, string> = {
  all: 'All tested',
  fba: 'FBA',
  prebox: 'Pre-box',
  hold: 'Hold',
};

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
