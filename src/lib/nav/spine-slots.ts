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
 * Stations (`floor`) and Desks (`desks`) are one slot each — benches and
 * pointer desks are not reorderable as individual L1 rows; they list under
 * standing group labels. Home · Media Library stay structural above both.
 */

import {
  isSpineDeskItem,
  isSpineMapTopRow,
  type SidebarNavItem,
  type SpineSectionId,
} from '@/lib/sidebar-navigation';

/** Cap matches the Zod max on `staff_preferences.spineSlots`. */
export const SPINE_SLOTS_MAX = 40;

/** Synthetic spine slot for the Stations group. */
export const SPINE_STATIONS_SLOT_ID = 'floor';

/** Synthetic spine slot for the Desks group. */
export const SPINE_DESKS_SLOT_ID = 'desks';

/** True when this catalog row participates in staff reorder as its own L1. */
export function isSpineSlottable(item: SidebarNavItem): boolean {
  // Home / Media Library stay structural. Parked tops (Search, Plans, Chat,
  // Settings) never paint as map rows.
  if (item.kind === 'top') return false;
  // Floor benches collapse into {@link SPINE_STATIONS_SLOT_ID}.
  if (item.kind === 'station') return false;
  // Pointer desks collapse into {@link SPINE_DESKS_SLOT_ID}.
  if (isSpineDeskItem(item)) return false;
  return true;
}

function stationIdSet(allowed: readonly SidebarNavItem[]): Set<string> {
  return new Set(
    allowed.filter((item) => item.kind === 'station').map((item) => item.id),
  );
}

function deskIdSet(allowed: readonly SidebarNavItem[]): Set<string> {
  return new Set(
    allowed.filter((item) => isSpineDeskItem(item)).map((item) => item.id),
  );
}

/** Groups render inline — no list-replace parent remains. */
export function spineParentDrillId(_section: SpineSectionId | null): string | null {
  return null;
}

/**
 * Default order: Stations, then Desks, then remaining L1 (Studio · Admin).
 */
export function defaultSpineOrder(allowed: readonly SidebarNavItem[]): string[] {
  const out: string[] = [];
  if (allowed.some((item) => item.kind === 'station')) {
    out.push(SPINE_STATIONS_SLOT_ID);
  }
  if (allowed.some((item) => isSpineDeskItem(item))) {
    out.push(SPINE_DESKS_SLOT_ID);
  }
  for (const item of allowed) {
    if (!isSpineSlottable(item)) continue;
    out.push(item.id);
    if (out.length >= SPINE_SLOTS_MAX) break;
  }
  return out;
}

/**
 * Apply a prefs id list onto the allowed catalog. Empty prefs → full default
 * order. Known ids keep staff order; new catalog ids append; unknown / gated
 * ids drop. Legacy prefs that stored individual station or desk page ids
 * collapse to {@link SPINE_STATIONS_SLOT_ID} / {@link SPINE_DESKS_SLOT_ID}.
 */
export function hydrateSpineSlots(
  raw: readonly string[] | null | undefined,
  allowed: readonly SidebarNavItem[],
): string[] {
  const defaults = defaultSpineOrder(allowed);
  const allow = new Set(defaults);
  const stations = stationIdSet(allowed);
  const desks = deskIdSet(allowed);
  if (!raw || raw.length === 0) {
    return defaults.slice(0, SPINE_SLOTS_MAX);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id !== 'string' || !id) continue;
    const resolved = stations.has(id)
      ? SPINE_STATIONS_SLOT_ID
      : desks.has(id)
        ? SPINE_DESKS_SLOT_ID
        : id;
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
 * Resolve ordered ids to page rows. Skips Scan Stations / Desks slots and any
 * id missing from the allowed list — callers that need the enter rows use
 * {@link resolveSpineMapEntries}.
 */
export function resolveSpineSlotPages<T extends { id: string }>(
  slotIds: readonly string[],
  allowed: readonly T[],
): T[] {
  const byId = new Map(allowed.map((page) => [page.id, page]));
  const out: T[] = [];
  for (const id of slotIds) {
    if (id === SPINE_STATIONS_SLOT_ID || id === SPINE_DESKS_SLOT_ID) continue;
    const page = byId.get(id);
    if (page) out.push(page);
  }
  return out;
}

export type SpineMapEntry<T extends { id: string; kind?: string }> =
  | { kind: 'stations'; id: typeof SPINE_STATIONS_SLOT_ID }
  | { kind: 'desks'; id: typeof SPINE_DESKS_SLOT_ID }
  | { kind: 'page'; id: string; page: T };

function isDeskLike(page: { kind?: string; mainGroup?: string }): boolean {
  return isSpineDeskItem(page as SidebarNavItem);
}

/**
 * Ordered root-map entries for MasterNav — remaining L1 pages plus Scan
 * Stations and Desks slots when the catalog has those families.
 */
export function resolveSpineMapEntries<T extends { id: string; kind?: string; mainGroup?: string }>(
  slotIds: readonly string[],
  allowed: readonly T[],
): SpineMapEntry<T>[] {
  const byId = new Map(allowed.map((page) => [page.id, page]));
  const hasStations = allowed.some((page) => page.kind === 'station');
  const hasDesks = allowed.some((page) => isDeskLike(page));
  const out: SpineMapEntry<T>[] = [];
  for (const id of slotIds) {
    if (id === SPINE_STATIONS_SLOT_ID) {
      if (hasStations) out.push({ kind: 'stations', id: SPINE_STATIONS_SLOT_ID });
      continue;
    }
    if (id === SPINE_DESKS_SLOT_ID) {
      if (hasDesks) out.push({ kind: 'desks', id: SPINE_DESKS_SLOT_ID });
      continue;
    }
    const page = byId.get(id);
    if (!page || page.kind === 'station' || isDeskLike(page)) continue;
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
