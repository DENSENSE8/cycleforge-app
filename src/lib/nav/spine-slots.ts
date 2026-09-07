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
 * Default order: Automations FIRST (marketplace-first IA, 2026-09-06), then
 * Stations, then Desks, then the remaining L1 rows.
 */
export function defaultSpineOrder(allowed: readonly SidebarNavItem[]): string[] {
  const out: string[] = [];
  // Automations leads the map: the automated system you assemble is the first
  // thing the spine names, above the Stations and Workspaces you operate. Guard
  // on the catalog actually carrying the row (and it being slottable) so a
  // gated-out tenant never leads with a phantom.
  const leadsWithAutomations = allowed.some(
    (item) => item.id === 'studio' && isSpineSlottable(item),
  );
  if (leadsWithAutomations) out.push('studio');
  if (allowed.some((item) => item.kind === 'station')) {
    out.push(SPINE_STATIONS_SLOT_ID);
  }
  if (allowed.some((item) => isSpineDeskItem(item))) {
    out.push(SPINE_DESKS_SLOT_ID);
  }
  for (const item of allowed) {
    if (!isSpineSlottable(item)) continue;
    if (item.id === 'studio') continue; // already led with it
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
 * Current default-order generation. Bump when the DEFAULT order changes in a
 * way existing operators should inherit.
 *
 * v1 (2026-09-06): Automations (`studio`) leads the map.
 */
export const SPINE_SLOTS_VERSION = 1;

export interface SpineSlotsMigration {
  /** Order to render now. */
  slots: string[];
  /**
   * Prefs to persist ONCE, or `null` when nothing should be written. Present
   * only for an operator whose saved order predates {@link SPINE_SLOTS_VERSION}.
   */
  stamp: { spineSlots: string[]; spineSlotsVersion: number } | null;
}

/**
 * Roll a saved order onto the current default generation without overwriting
 * the operator's arrangement.
 *
 * A saved `spineSlots` is protected state: it is the operator saying where
 * their work lives. So a new default is NOT applied by replacing that list —
 * v1 floats `studio` to the front and leaves every other row in the order the
 * operator put it in, then stamps the version so no operator is ever floated
 * twice (they may drag Automations back down and it stays down).
 *
 * An operator with NO saved order needs no write at all: {@link hydrateSpineSlots}
 * already derives the current default for them, and a future generation will
 * derive that one.
 */
export function migrateSpineSlots(
  raw: readonly string[] | null | undefined,
  allowed: readonly SidebarNavItem[],
  savedVersion: number | null | undefined,
): SpineSlotsMigration {
  const slots = hydrateSpineSlots(raw, allowed);
  if (!raw || raw.length === 0) return { slots, stamp: null };
  // A catalog that has not resolved yet (permissions still loading) hydrates to
  // nothing — stamping that would persist an EMPTY order over a real one.
  if (allowed.length === 0 || slots.length === 0) return { slots, stamp: null };
  if ((savedVersion ?? 0) >= SPINE_SLOTS_VERSION) return { slots, stamp: null };

  const lead = slots.indexOf('studio');
  const floated =
    lead > 0 ? ['studio', ...slots.filter((id) => id !== 'studio')] : slots;
  return {
    slots: floated,
    stamp: { spineSlots: floated, spineSlotsVersion: SPINE_SLOTS_VERSION },
  };
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
