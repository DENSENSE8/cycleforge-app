/**
 * Shipping surfaces that are their own route segment.
 *
 * `labels` was REMOVED 2026-08-30 with `/shipping/labels`: needing a label is a
 * state in the To-ship queue now, and buying / attaching one happens on the
 * order's own details panel (`OrderDocumentsSection` → `BuyLabelSection`), not
 * at a separate station.
 */
export type OutboundMode = 'scan-out' | 'fba';

/** Canonical Shipping station path. Legacy `/outbound` permanently redirects here. */
export const SHIPPING_PATH = '/shipping';

/**
 * Each mode's own route. The mode is the PATH now, not `?mode=` — being on
 * `/shipping/fba` IS fba mode, the way being on `/unbox` is Unbox.
 *
 * Ready is a lifecycle stage *inside* FBA (`?fbaMode=ready`), not a sibling
 * shipping path. Legacy `/shipping/ready` permanently redirects there.
 *
 * `labels` keeps a segment of its own rather than living at bare `/shipping`:
 * one canonical URL per view beats a default that is reachable two ways. Bare
 * `/shipping` redirects here (307 while the legacy `?mode=` links drain).
 */
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

export const OUTBOUND_SORT_OPTIONS: { id: OutboundSort; label: string }[] = [
  { id: 'priority', label: 'Priority (due soon)' },
  { id: 'newest', label: 'Newest first' },
];

/**
 * Resolve a legacy `?mode=` token. `labels` was the default until its route was
 * deleted (2026-08-30); FBA is the fallback now — the only remaining Shipping
 * mode that is a browsable workbench rather than a scan station. A stale
 * `?mode=labels` link therefore lands on Amazon Prep rather than 404ing.
 */
export function parseOutboundMode(raw: string | null): OutboundMode {
  if (raw === 'scan-out') return 'scan-out';
  return 'fba';
}

export function parseOutboundSort(raw: string | null): OutboundSort {
  return raw === 'newest' ? 'newest' : 'priority';
}
