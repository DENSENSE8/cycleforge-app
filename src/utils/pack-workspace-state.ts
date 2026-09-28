/** Pack workbench tabs on `/pack` — URL SoT via `?packview=`. */

export type PackWorkspaceTab = 'queue' | 'history';

/** Pack scan sub-mode on `/pack` (`?packMode=`). Standard = omit. */
type PackScanMode = 'standard' | 'fragile' | 'multi';

const PACK_SCAN_MODES = [
  'standard',
  'fragile',
  'multi',
] as const satisfies readonly PackScanMode[];

const PACK_WORKSPACE_TAB_PARAM = 'packview';

const PACK_WORKSPACE_TAB_LABEL: Record<PackWorkspaceTab, string> = {
  queue: 'Queue',
  history: 'History',
};

const VALID: ReadonlySet<string> = new Set(['queue', 'history']);

/** Raw-string form of {@link getPackWorkspaceTabFromSearch}, for callers that hold a value rather than a `URLSearchParams` — notably the… */
export function parsePackWorkspaceTab(raw: string | null): PackWorkspaceTab {
  const value = String(raw || '').trim().toLowerCase();
  return VALID.has(value) ? (value as PackWorkspaceTab) : 'queue';
}

/**
 * Wire tokens `?packMode=` may carry (route-param hygiene). Includes default
 * `standard` so a deep link is not stripped mid-flight.
 */
export function parsePackScanModeWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (PACK_SCAN_MODES as readonly string[]).includes(v) ? v : null;
}

export function parsePackScanMode(raw: string | null | undefined): PackScanMode {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'fragile' || v === 'multi') return v;
  return 'standard';
}

export function getPackWorkspaceTabFromSearch(
  searchParams: Pick<URLSearchParams, 'get'>,
): PackWorkspaceTab {
  return parsePackWorkspaceTab(searchParams.get(PACK_WORKSPACE_TAB_PARAM));
}

/**
 * Normalize URL for a pack workbench tab switch.
 * Queue defaults `ustatus=PICKED` (ready-to-pack). History clears fulfillment filters.
 * Omits `packview` when queue (default) so the default URL stays clean.
 */
export function normalizePackWorkspaceTabParams(
  params: URLSearchParams,
  preferredTab?: PackWorkspaceTab,
): PackWorkspaceTab {
  const nextTab = preferredTab ?? getPackWorkspaceTabFromSearch(params);
  params.delete(PACK_WORKSPACE_TAB_PARAM);

  if (nextTab === 'queue') {
    const ustatus = String(params.get('ustatus') || '')
      .trim()
      .toUpperCase();
    if (ustatus !== 'PENDING' && ustatus !== 'PICKED' && ustatus !== 'BLOCKED') {
      params.set('ustatus', 'PICKED');
    }
    params.delete('stage');
    params.delete('attention');
  } else {
    params.set(PACK_WORKSPACE_TAB_PARAM, 'history');
    params.delete('ustatus');
    params.delete('stage');
    params.delete('attention');
    params.delete('late');
    params.delete('surface');
  }

  return nextTab;
}
