/** Shipping surfaces that are their own route segment. */
export type OutboundMode = 'scan-out' | 'fba';

/** Canonical Shipping station path. Legacy `/outbound` permanently redirects here. */
export const SHIPPING_PATH = '/shipping';

/** Each mode's own route. */
export const OUTBOUND_MODE_PATHS: Record<OutboundMode, string> = {
  fba: `${SHIPPING_PATH}/fba`,
  'scan-out': `${SHIPPING_PATH}/scan-out`,
};

/** The mode this pathname IS, or null when it is not a shipping mode route. */
export function outboundModeFromPath(pathname: string | null | undefined): OutboundMode | null {
  if (!pathname) return null;
  for (const [mode, path] of Object.entries(OUTBOUND_MODE_PATHS)) {
    if (pathname === path || pathname.startsWith(`${path}/`)) return mode as OutboundMode;
  }
  return null;
}

export type OutboundSort = 'priority' | 'newest';

/** Resolve a legacy `?mode=` token. */
export function parseOutboundMode(raw: string | null): OutboundMode {
  if (raw === 'scan-out') return 'scan-out';
  return 'fba';
}

export function parseOutboundSort(raw: string | null): OutboundSort {
  return raw === 'newest' ? 'newest' : 'priority';
}
