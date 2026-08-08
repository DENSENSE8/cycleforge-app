/**
 * Inventory › Locations — canonical path after folding `/warehouse` under Inventory.
 * Nested facets still use `?tab=` (Bin Tags default = omit).
 */

const INVENTORY_LOCATIONS_PATH = '/inventory/locations' as const;

export type LocationsTab = 'labels' | 'racks' | 'rooms' | 'bins' | 'map';

/** Live Locations tabs — includes default `labels` (usually omitted). */
export const LOCATIONS_TABS = [
  'labels',
  'racks',
  'rooms',
  'bins',
  'map',
] as const satisfies readonly LocationsTab[];

export function parseLocationsTab(raw: string | null | undefined): LocationsTab {
  if (raw === 'rooms' || raw === 'bins' || raw === 'racks' || raw === 'map') return raw;
  return 'labels';
}

/**
 * Wire tokens `?tab=` may carry on `/inventory/locations` (route-param hygiene).
 * Includes `labels`. Do not round-trip {@link parseLocationsTab}.
 */
export function parseLocationsTabWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (LOCATIONS_TABS as readonly string[]).includes(v) ? v : null;
}

/** Build `/inventory/locations?…` for deep links (barcode routing, redirects). */
export function inventoryLocationsHref(opts?: {
  tab?: LocationsTab | null;
  extra?: Record<string, string | null | undefined>;
}): string {
  const params = new URLSearchParams();
  const tab = opts?.tab;
  if (tab && tab !== 'labels') params.set('tab', tab);
  if (opts?.extra) {
    for (const [k, v] of Object.entries(opts.extra)) {
      if (v == null || v === '') params.delete(k);
      else params.set(k, v);
    }
  }
  const qs = params.toString();
  return qs ? `${INVENTORY_LOCATIONS_PATH}?${qs}` : INVENTORY_LOCATIONS_PATH;
}
