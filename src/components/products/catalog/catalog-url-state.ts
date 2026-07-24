/**
 * Products Catalog URL state — platform tabs + chrome refine filters.
 *
 * Platform (`platform`) is the primary chrome tab (Zoho inventory master +
 * sales channels). Link segments (`linkFilter`) are optional refine scopes
 * demoted into the filter popover — not top tabs. Other refine flags are
 * client-side filters on the loaded page (URL-backed so share/reload keeps
 * the chrome hot). Keep in sync with ProductsCatalogWorkspace.
 */

import {
  PRODUCT_HUB_PLATFORMS,
  platformStyle,
  type ProductHubPlatform,
} from '@/components/products/pairing/platform-style';

type CatalogPlatformTab = 'zoho' | ProductHubPlatform;

/** Optional refine — former chrome segments, now filter-menu only. */
export type CatalogLinkFilter = 'active_linked' | 'unlinked_pending' | 'all';

export interface CatalogRefineFilters {
  /** Server-side MDM segment (omit / `all` = full list for the platform tab). */
  linkFilter: CatalogLinkFilter;
  pendingOnly: boolean;
  inactiveOnly: boolean;
  missingChannels: boolean;
  missingManuals: boolean;
  missingQc: boolean;
}

export const EMPTY_CATALOG_REFINE: CatalogRefineFilters = {
  linkFilter: 'all',
  pendingOnly: false,
  inactiveOnly: false,
  missingChannels: false,
  missingManuals: false,
  missingQc: false,
};

const HUB_PLATFORM_SET = new Set<string>(PRODUCT_HUB_PLATFORMS);

export function parseCatalogPlatform(raw: string | null): CatalogPlatformTab {
  if (!raw || raw === 'zoho') return 'zoho';
  const key = raw.trim().toLowerCase();
  if (HUB_PLATFORM_SET.has(key)) return key as ProductHubPlatform;
  return 'zoho';
}

/** Former chrome tabs — only `active_linked` / `unlinked_pending` are refine hot. */
export function parseLinkFilter(raw: string | null): CatalogLinkFilter {
  if (raw === 'active_linked' || raw === 'unlinked_pending') return raw;
  return 'all';
}

function flagOn(raw: string | null): boolean {
  return raw === '1' || raw === 'true';
}

export function parseCatalogRefine(params: URLSearchParams): CatalogRefineFilters {
  return {
    linkFilter: parseLinkFilter(params.get('linkFilter')),
    pendingOnly: flagOn(params.get('pending')),
    inactiveOnly: flagOn(params.get('inactive')),
    missingChannels: flagOn(params.get('noChannels')),
    missingManuals: flagOn(params.get('noManuals')),
    missingQc: flagOn(params.get('noQc')),
  };
}

export function catalogRefineIsHot(refine: CatalogRefineFilters): boolean {
  return (
    refine.linkFilter !== 'all' ||
    refine.pendingOnly ||
    refine.inactiveOnly ||
    refine.missingChannels ||
    refine.missingManuals ||
    refine.missingQc
  );
}

/** Write refine flags onto a URLSearchParams mutator (null clears). */
export function applyCatalogRefineParams(
  params: URLSearchParams,
  refine: Partial<CatalogRefineFilters> | null,
): void {
  if (refine === null) {
    params.delete('linkFilter');
    params.delete('pending');
    params.delete('inactive');
    params.delete('noChannels');
    params.delete('noManuals');
    params.delete('noQc');
    return;
  }
  const setFlag = (key: string, on: boolean | undefined) => {
    if (on === undefined) return;
    if (on) params.set(key, '1');
    else params.delete(key);
  };
  if (refine.linkFilter !== undefined) {
    if (refine.linkFilter === 'all') params.delete('linkFilter');
    else params.set('linkFilter', refine.linkFilter);
  }
  setFlag('pending', refine.pendingOnly);
  setFlag('inactive', refine.inactiveOnly);
  setFlag('noChannels', refine.missingChannels);
  setFlag('noManuals', refine.missingManuals);
  setFlag('noQc', refine.missingQc);
}

interface CatalogRefineRow {
  is_active: boolean;
  has_pending_action: boolean;
  platform_count: number;
  manual_count: number;
  qc_step_count: number;
}

export function applyCatalogRefine<T extends CatalogRefineRow>(
  rows: T[],
  refine: CatalogRefineFilters,
): T[] {
  // linkFilter is applied server-side; only client flags run here.
  const clientHot =
    refine.pendingOnly ||
    refine.inactiveOnly ||
    refine.missingChannels ||
    refine.missingManuals ||
    refine.missingQc;
  if (!clientHot) return rows;
  return rows.filter((row) => {
    if (refine.pendingOnly && !row.has_pending_action) return false;
    if (refine.inactiveOnly && row.is_active) return false;
    if (refine.missingChannels && row.platform_count > 0) return false;
    if (refine.missingManuals && row.manual_count > 0) return false;
    if (refine.missingQc && row.qc_step_count > 0) return false;
    return true;
  });
}

/** Chrome tab list — Zoho inventory master + Product Hub channels. */
export function catalogPlatformTabs(): Array<{ id: CatalogPlatformTab; label: string }> {
  return [
    { id: 'zoho', label: platformStyle('zoho').label },
    ...PRODUCT_HUB_PLATFORMS.map((id) => ({
      id: id as CatalogPlatformTab,
      label: platformStyle(id).label,
    })),
  ];
}
