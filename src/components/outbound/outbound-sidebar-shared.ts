import { SHIPPING_MODE_ICONS } from '@/lib/nav/station-nav-icons';
import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';

export type OutboundMode = 'labels' | 'scan-out' | 'ready' | 'fba';

/** Canonical Shipping station path. Legacy `/outbound` permanently redirects here. */
export const SHIPPING_PATH = '/shipping';

/**
 * Each mode's own route. The mode is the PATH now, not `?mode=` — being on
 * `/shipping/ready` IS ready mode, the way being on `/unbox` is Unbox.
 *
 * `labels` keeps a segment of its own rather than living at bare `/shipping`:
 * one canonical URL per view beats a default that is reachable two ways. Bare
 * `/shipping` redirects here (307 while the legacy `?mode=` links drain).
 */
export const OUTBOUND_MODE_PATHS: Record<OutboundMode, string> = {
  labels: `${SHIPPING_PATH}/labels`,
  ready: `${SHIPPING_PATH}/ready`,
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

export const OUTBOUND_MODE_ITEMS: HorizontalSliderItem[] = [
  { id: 'labels', label: 'Labels', icon: SHIPPING_MODE_ICONS.labels },
  { id: 'ready', label: 'Ready', icon: SHIPPING_MODE_ICONS.ready },
  { id: 'fba', label: 'FBA', icon: SHIPPING_MODE_ICONS.fba },
  // Scan out sits last (rightmost) — dock ship-confirm, the end-of-line action.
  { id: 'scan-out', label: 'Scan out', icon: SHIPPING_MODE_ICONS['scan-out'] },
];

export type OutboundSort = 'priority' | 'newest';

export const OUTBOUND_SORT_OPTIONS: { id: OutboundSort; label: string }[] = [
  { id: 'priority', label: 'Priority (due soon)' },
  { id: 'newest', label: 'Newest first' },
];

export function parseOutboundMode(raw: string | null): OutboundMode {
  if (raw === 'scan-out') return 'scan-out';
  if (raw === 'ready') return 'ready';
  if (raw === 'fba') return 'fba';
  return 'labels';
}

export function parseOutboundSort(raw: string | null): OutboundSort {
  return raw === 'newest' ? 'newest' : 'priority';
}
