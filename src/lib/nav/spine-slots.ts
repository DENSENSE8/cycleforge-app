/** Per-staff MasterNav order — ordered ids into the nav catalog. */

import {
  DESK_SPINE_SECTIONS,
  isSpineDeskItem,
  isSpineMapTopRow,
  spineSectionIdForPage,
  type MainGroupId,
  type SidebarNavItem,
  type StationGroupId,
  type SpineSectionId,
} from '@/lib/sidebar-navigation';
import type { DomainGroupId } from '@/lib/nav/lanes';

/** Cap matches the Zod max on `staff_preferences.spineSlots`. */
export const SPINE_SLOTS_MAX = 40;

/** Synthetic spine slot for the Scan Stations enter row / drill. */
export const SPINE_STATIONS_SLOT_ID = 'floor';

/** The v1/v2 wire value for the single Workspaces parent, as it still sits in `staff_preferences.prefs.spineSlots` rows written before v3. */
export const LEGACY_DESKS_SLOT_ID = 'desks';

/**
 * One synthetic slot per LANE — Inbound · Outbound · Inventory · Products · Sales · Support · Operations, in `DESK_SPINE_SECTIONS` order.
 * v3 (operator 2026-09-14) deleted the single "Workspaces" parent. The lanes
 */
export const SPINE_LANE_SLOT_IDS: ReadonlyArray<SpineSectionId> = DESK_SPINE_SECTIONS.map(
  (section) => section.id,
);

/** Default-order generation. */
export const SPINE_SLOTS_VERSION = 3;

/** True when this catalog row participates in staff reorder as its own L1. */
export function isSpineSlottable(item: SidebarNavItem): boolean {
  // Home / Media Library stay structural. Parked tops (Search, Plans, Chat,
  // Settings) never paint as map rows.
  if (item.kind === 'top') return false;
  // Floor benches collapse into {@link SPINE_STATIONS_SLOT_ID}.
  if (item.kind === 'station') return false;
  // Desk pages collapse into their LANE slot (v3) — Inbound, Outbound, … —
  // not into a single Workspaces parent.
  if (isSpineDeskItem(item)) return false;
  return true;
}

function stationIdSet(allowed: readonly SidebarNavItem[]): Set<string> {
  return new Set(
    allowed.filter((item) => item.kind === 'station').map((item) => item.id),
  );
}

/**
 * Desk page id → its lane slot id. Used to fold a saved order that stored
 * individual desk pages (pre-v1 prefs) onto the lane that now owns them.
 */
function laneByDeskId(allowed: readonly SidebarNavItem[]): Map<string, SpineSectionId> {
  const out = new Map<string, SpineSectionId>();
  for (const item of allowed) {
    if (!isSpineDeskItem(item)) continue;
    const lane = spineSectionIdForPage(item);
    if (lane) out.set(item.id, lane);
  }
  return out;
}

/** Lane slots the current catalog can actually paint, in registry order. */
function lanesPresent(allowed: readonly SidebarNavItem[]): SpineSectionId[] {
  const live = new Set(laneByDeskId(allowed).values());
  return SPINE_LANE_SLOT_IDS.filter((lane) => live.has(lane));
}

/**
 * Default order: **the lane band, then remaining L1** (Automations), then
 * **Scan Stations at the very bottom** (operator 2026-09-27 — station work is
 * physical and belongs on the phone; the desk map leads with the desks). A
 * lane with no visible page is absent — never a header over nothing (C10:
 * absent, not a disabled pill).
 */
export function defaultSpineOrder(allowed: readonly SidebarNavItem[]): string[] {
  // Lanes lead (v2 ruling, kept): the domains are the work.
  const out: string[] = [...lanesPresent(allowed)];
  const stations = allowed.some((item) => item.kind === 'station');
  // Keep the last slot for Stations so the cap never drops it.
  const cap = stations ? SPINE_SLOTS_MAX - 1 : SPINE_SLOTS_MAX;
  for (const item of allowed) {
    if (!isSpineSlottable(item)) continue;
    out.push(item.id);
    if (out.length >= cap) break;
  }
  if (stations) out.push(SPINE_STATIONS_SLOT_ID);
  return out.slice(0, SPINE_SLOTS_MAX);
}

/** Apply a prefs id list onto the allowed catalog. */
export function hydrateSpineSlots(
  raw: readonly string[] | null | undefined,
  allowed: readonly SidebarNavItem[],
): string[] {
  const defaults = defaultSpineOrder(allowed);
  const allow = new Set(defaults);
  const stations = stationIdSet(allowed);
  const laneOf = laneByDeskId(allowed);
  const lanes = lanesPresent(allowed);
  if (!raw || raw.length === 0) {
    return defaults.slice(0, SPINE_SLOTS_MAX);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (seen.has(id) || !allow.has(id)) return;
    seen.add(id);
    out.push(id);
  };

  for (const id of raw) {
    if (typeof id !== 'string' || !id) continue;
    // The v1/v2 Workspaces parent expands HERE, at its saved position, so a
    // staffer who had moved the desk block keeps where they put it.
    if (id === LEGACY_DESKS_SLOT_ID) {
      for (const lane of lanes) push(lane);
      if (out.length >= SPINE_SLOTS_MAX) return out.slice(0, SPINE_SLOTS_MAX);
      continue;
    }
    push(stations.has(id) ? SPINE_STATIONS_SLOT_ID : (laneOf.get(id) ?? id));
    if (out.length >= SPINE_SLOTS_MAX) return out.slice(0, SPINE_SLOTS_MAX);
  }
  for (const id of defaults) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= SPINE_SLOTS_MAX) break;
  }
  return out;
}

/** Groups render inline — no list-replace parent remains. */
export function spineParentDrillId(_section: SpineSectionId | null): string | null {
  return null;
}

interface SpineSlotsMigration {
  slots: string[];
  stamp: { spineSlots: string[]; spineSlotsVersion: number } | null;
}

/** Move the LANE BAND to sit immediately above Scan Stations, preserving every other id and its relative order. */
function liftLanesAboveStations(slots: readonly string[]): string[] {
  const laneIds = new Set<string>(SPINE_LANE_SLOT_IDS);
  const floorAt = slots.indexOf(SPINE_STATIONS_SLOT_ID);
  const firstLaneAt = slots.findIndex((id) => laneIds.has(id));
  // Absent either family, or already in v3 order: nothing to do.
  if (firstLaneAt < 0 || floorAt < 0 || firstLaneAt < floorAt) return [...slots];
  const band = slots.filter((id) => laneIds.has(id));
  const rest = slots.filter((id) => !laneIds.has(id));
  const target = rest.indexOf(SPINE_STATIONS_SLOT_ID);
  return [...rest.slice(0, target), ...band, ...rest.slice(target)];
}

/** Roll a saved order onto the current default generation without overwriting the operator's arrangement. */
export function migrateSpineSlots(
  raw: readonly string[] | null | undefined,
  allowed: readonly SidebarNavItem[],
  savedVersion: number | null | undefined,
): SpineSlotsMigration {
  const hydrated = hydrateSpineSlots(raw, allowed);
  // No saved order → the operator never arranged anything, so `defaultSpineOrder`
  // already answers in v3 order and there is nothing to migrate or stamp.
  if (!raw || raw.length === 0) return { slots: hydrated, stamp: null };
  if (allowed.length === 0 || hydrated.length === 0) return { slots: hydrated, stamp: null };
  if ((savedVersion ?? 0) >= SPINE_SLOTS_VERSION) return { slots: hydrated, stamp: null };

  const slots = liftLanesAboveStations(hydrated);
  return {
    slots,
    stamp: { spineSlots: slots, spineSlotsVersion: SPINE_SLOTS_VERSION },
  };
}

/**
 * Resolve ordered ids to page rows. Skips the Stations slot, every lane slot,
 * and any id missing from the allowed list — callers that need the group
 * entries use {@link resolveSpineMapEntries}.
 */
export function resolveSpineSlotPages<T extends { id: string }>(
  slotIds: readonly string[],
  allowed: readonly T[],
): T[] {
  const laneIds = new Set<string>(SPINE_LANE_SLOT_IDS);
  const byId = new Map(allowed.map((page) => [page.id, page]));
  const out: T[] = [];
  for (const id of slotIds) {
    if (id === SPINE_STATIONS_SLOT_ID || laneIds.has(id)) continue;
    const page = byId.get(id);
    if (page) out.push(page);
  }
  return out;
}

type SpineMapEntry<T extends { id: string; kind?: string }> =
  | { kind: 'stations'; id: typeof SPINE_STATIONS_SLOT_ID }
  | { kind: 'lane'; id: SpineSectionId }
  | { kind: 'page'; id: string; page: T };

function isDeskLike(page: { kind?: string; mainGroup?: string }): boolean {
  return isSpineDeskItem(page as SidebarNavItem);
}

/** Ordered root-map entries for MasterNav — the lane band, the Stations slot, and the remaining L1 pages, each emitted only when the… */
export function resolveSpineMapEntries<
  T extends {
    id: string;
    kind?: 'top' | 'bottom' | 'main' | 'station' | 'domain';
    mainGroup?: MainGroupId;
    stationGroup?: StationGroupId;
    domainGroup?: DomainGroupId;
  },
>(
  slotIds: readonly string[],
  allowed: readonly T[],
): SpineMapEntry<T>[] {
  const byId = new Map(allowed.map((page) => [page.id, page]));
  const hasStations = allowed.some((page) => page.kind === 'station');
  // `spineSectionIdForPage` reads a structural shape, so the widened generic
  // above removes the `as SidebarNavItem` cast tsc rejected: T is no longer
  // missing `domainGroup`, which is the field that decides a desk row's lane.
  const liveLanes = new Set<string>(
    allowed
      .filter((page) => isDeskLike(page))
      .map((page) => spineSectionIdForPage(page))
      .filter((lane): lane is SpineSectionId => lane !== null),
  );
  const out: SpineMapEntry<T>[] = [];
  for (const id of slotIds) {
    if (id === SPINE_STATIONS_SLOT_ID) {
      if (hasStations) out.push({ kind: 'stations', id: SPINE_STATIONS_SLOT_ID });
      continue;
    }
    if (liveLanes.has(id)) {
      out.push({ kind: 'lane', id: id as SpineSectionId });
      continue;
    }
    // A lane slot the current role cannot paint drops out entirely.
    if ((SPINE_LANE_SLOT_IDS as readonly string[]).includes(id)) continue;
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
