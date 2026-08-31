/**
 * Per-staff MasterNav order — ordered ids into the nav catalog.
 *
 * Org `nav_definitions` decide what exists (hide/rename). Permissions decide
 * who can open a surface. This module only answers *order on my spine*.
 * Prefs store ids only — never href / icon / permission.
 *
 * Absent / null / [] → full catalog in registry order (not an empty slate).
 * Saved order wins; any new catalog ids the staffer can see append at the end.
 *
 * Scan Stations (`floor`) is one slot — individual benches are not reorderable
 * on the root map; they live behind the list-replace drill.
 */

import {
  isSpineMapTopRow,
  type SidebarNavItem,
} from '@/lib/sidebar-navigation';

/** Cap matches the Zod max on `staff_preferences.spineSlots`. */
export const SPINE_SLOTS_MAX = 40;

/** Synthetic spine slot for the Scan Stations enter row / drill. */
export const SPINE_STATIONS_SLOT_ID = 'floor';

/** True when this catalog row participates in staff reorder as its own L1. */
export function isSpineSlottable(item: SidebarNavItem): boolean {
  // Home / Media Library stay structural. Parked tops (Search, Plans, Chat,
  // Settings) never paint as map rows.
  if (item.kind === 'top') return false;
  // Floor benches collapse into {@link SPINE_STATIONS_SLOT_ID}.
  if (item.kind === 'station') return false;
  return true;
}

function stationIdSet(allowed: readonly SidebarNavItem[]): Set<string> {
  return new Set(
    allowed.filter((item) => item.kind === 'station').map((item) => item.id),
  );
}

/** Default order = slottable pages + one Scan Stations slot at first-bench position. */
export function defaultSpineOrder(allowed: readonly SidebarNavItem[]): string[] {
  const out: string[] = [];
  let insertedFloor = false;
  for (const item of allowed) {
    if (item.kind === 'top') continue;
    if (item.kind === 'station') {
      if (!insertedFloor) {
        out.push(SPINE_STATIONS_SLOT_ID);
        insertedFloor = true;
      }
      continue;
    }
    out.push(item.id);
    if (out.length >= SPINE_SLOTS_MAX) break;
  }
  return out;
}

/**
 * Apply a prefs id list onto the allowed catalog. Empty prefs → full default
 * order. Known ids keep staff order; new catalog ids append; unknown / gated
 * ids drop. Legacy prefs that stored individual station page ids collapse to
 * a single {@link SPINE_STATIONS_SLOT_ID}.
 */
export function hydrateSpineSlots(
  raw: readonly string[] | null | undefined,
  allowed: readonly SidebarNavItem[],
): string[] {
  const defaults = defaultSpineOrder(allowed);
  const allow = new Set(defaults);
  const stations = stationIdSet(allowed);
  if (!raw || raw.length === 0) {
    return defaults.slice(0, SPINE_SLOTS_MAX);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id !== 'string' || !id) continue;
    const resolved = stations.has(id) ? SPINE_STATIONS_SLOT_ID : id;
    if (seen.has(resolved) || !allow.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
    if (out.length >= SPINE_SLOTS_MAX) return out;
  }
  for (const id of defaults) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= SPINE_SLOTS_MAX) break;
  }
  return out;
}

/**
 * Resolve ordered ids to page rows. Skips the Scan Stations slot and any id
 * missing from the allowed list — callers that need the enter row use
 * {@link resolveSpineMapEntries}.
 */
export function resolveSpineSlotPages<T extends { id: string }>(
  slotIds: readonly string[],
  allowed: readonly T[],
): T[] {
  const byId = new Map(allowed.map((page) => [page.id, page]));
  const out: T[] = [];
  for (const id of slotIds) {
    if (id === SPINE_STATIONS_SLOT_ID) continue;
    const page = byId.get(id);
    if (page) out.push(page);
  }
  return out;
}

export type SpineMapEntry<T extends { id: string; kind?: string }> =
  | { kind: 'stations'; id: typeof SPINE_STATIONS_SLOT_ID }
  | { kind: 'page'; id: string; page: T };

/**
 * Ordered root-map entries for MasterNav — pages plus one Scan Stations slot
 * when the catalog has floor benches.
 */
export function resolveSpineMapEntries<T extends { id: string; kind?: string }>(
  slotIds: readonly string[],
  allowed: readonly T[],
): SpineMapEntry<T>[] {
  const byId = new Map(allowed.map((page) => [page.id, page]));
  const hasStations = allowed.some((page) => page.kind === 'station');
  const out: SpineMapEntry<T>[] = [];
  for (const id of slotIds) {
    if (id === SPINE_STATIONS_SLOT_ID) {
      if (hasStations) out.push({ kind: 'stations', id: SPINE_STATIONS_SLOT_ID });
      continue;
    }
    const page = byId.get(id);
    if (!page || page.kind === 'station') continue;
    out.push({ kind: 'page', id: page.id, page });
  }
  return out;
}

/** Structural map rows that stay above the reorderable list (Home · Media). */
export function spineStructuralTopPages<T extends SidebarNavItem>(
  pages: readonly T[],
): T[] {
  return pages.filter(isSpineMapTopRow);
}
