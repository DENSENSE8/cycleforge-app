/**
 * Inventory › Locations — canonical path after folding `/warehouse` under Inventory.
 * Nested facets still use `?tab=` (Bin Tags default = omit).
 *
 * The bay-printer facet is `bays`. Legacy `?tab=racks` still parses as `bays`.
 */

const INVENTORY_LOCATIONS_PATH = '/inventory/locations' as const;

export type LocationsTab = 'labels' | 'bays' | 'totes' | 'rooms' | 'bins' | 'map' | 'manage';

/** Live Locations tabs — includes default `labels` (usually omitted). */
export const LOCATIONS_TABS = [
  'labels',
  'bays',
  // Tote plates. A tote is a CONTAINER, not a place — it sits here because
  // this page is where the warehouse prints its 2×1 stock, not because a box
  // is a location. It owns no row in `locations` and never will.
  'totes',
  'rooms',
  'bins',
  'map',
  // Ex-admin bin editor (admin dissolution): rename / barcode / type /
  // capacity / delete. The Bins tab browses; Manage edits.
  'manage',
] as const satisfies readonly LocationsTab[];

/** Redirects that focus a bay (position=0) sticker. Accepts legacy `tab=racks`. */
export const LOCATIONS_BAY_CODE_RE =
  /^\/(?:warehouse|inventory\/locations)\?tab=(?:racks|bays)&code=(.+)$/;

export function parseLocationsTab(raw: string | null | undefined): LocationsTab {
  if (raw === 'racks' || raw === 'bays') return 'bays';
  if (raw === 'rooms' || raw === 'bins' || raw === 'map' || raw === 'manage') return raw;
  if (raw === 'totes') return 'totes';
  return 'labels';
}

/**
 * Locations facets whose body is a print/builder — no left context rail.
 * Labels · Bays · Totes. Rooms / Bins / Map / Manage keep the warehouse rail.
 */
export function isLocationsRaillessTab(tab: LocationsTab): boolean {
  return tab === 'labels' || tab === 'bays' || tab === 'totes';
}

/**
 * Wire tokens `?tab=` may carry on `/inventory/locations` (route-param hygiene).
 * Includes `labels`. Legacy `racks` round-trips to `bays`.
 */
export function parseLocationsTabWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v === 'racks') return 'bays';
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
