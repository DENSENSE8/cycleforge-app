/** Fixed product order for the MasterNav root map. */

import {
  DESK_SPINE_SECTIONS,
  isSpineBottomRow,
  isSpineDeskItem,
  isSpineMapTopRow,
  spineSectionIdForPage,
  type MainGroupId,
  type SidebarNavItem,
  type StationGroupId,
  type SpineSectionId,
} from '@/lib/sidebar-navigation';
import type { DomainGroupId } from '@/lib/nav/lanes';

/** Synthetic map entry for the single Scan Stations door. */
export const SPINE_STATIONS_SLOT_ID = 'floor';

const SPINE_LANE_IDS: ReadonlyArray<SpineSectionId> = DESK_SPINE_SECTIONS.map(
  (section) => section.id,
);

type FixedSpineItem = {
  id: string;
  kind?: 'top' | 'bottom' | 'main' | 'station' | 'domain';
  mainGroup?: MainGroupId;
  stationGroup?: StationGroupId;
  domainGroup?: DomainGroupId;
};

function isDeskLike(page: FixedSpineItem): boolean {
  return isSpineDeskItem(page);
}

function isFixedMapPage(item: FixedSpineItem): boolean {
  if (item.kind === 'top') return false;
  if (item.kind === 'station') return false;
  if (isDeskLike(item)) return false;
  return true;
}

function laneIdsPresent(allowed: readonly FixedSpineItem[]): SpineSectionId[] {
  const present = new Set<SpineSectionId>();
  for (const item of allowed) {
    if (!isDeskLike(item)) continue;
    const lane = spineSectionIdForPage(item);
    if (lane) present.add(lane);
  }
  return SPINE_LANE_IDS.filter((lane) => present.has(lane));
}

/**
 * One stable order for every operator: Scan Stations, the registered lane
 * sequence, then remaining root pages in registry order.
 */
export function fixedSpineOrder<T extends FixedSpineItem>(allowed: readonly T[]): string[] {
  return [
    ...(allowed.some((item) => item.kind === 'station')
      ? [SPINE_STATIONS_SLOT_ID]
      : []),
    ...laneIdsPresent(allowed),
    ...allowed.filter(isFixedMapPage).map((item) => item.id),
  ];
}

export type SpineMapEntry<T extends { id: string; kind?: string }> =
  | { kind: 'stations'; id: typeof SPINE_STATIONS_SLOT_ID }
  | { kind: 'lane'; id: SpineSectionId }
  | { kind: 'page'; id: string; page: T };

/** Resolve the fixed product order to the entries MasterNav paints. */
export function resolveSpineMapEntries<T extends FixedSpineItem>(
  allowed: readonly T[],
): SpineMapEntry<T>[] {
  const order = fixedSpineOrder(allowed);
  const byId = new Map(allowed.map((page) => [page.id, page]));
  const hasStations = allowed.some((page) => page.kind === 'station');
  const liveLanes = new Set<string>(
    allowed
      .filter((page) => isDeskLike(page))
      .map((page) => spineSectionIdForPage(page))
      .filter((lane): lane is SpineSectionId => lane !== null),
  );
  const out: SpineMapEntry<T>[] = [];

  for (const id of order) {
    if (id === SPINE_STATIONS_SLOT_ID) {
      if (hasStations) out.push({ kind: 'stations', id: SPINE_STATIONS_SLOT_ID });
      continue;
    }
    if (liveLanes.has(id)) {
      out.push({ kind: 'lane', id: id as SpineSectionId });
      continue;
    }
    const page = byId.get(id);
    if (!page || page.kind === 'station' || isDeskLike(page)) continue;
    out.push({ kind: 'page', id: page.id, page });
  }

  return out;
}

/** Structural map rows that stay above the ordered navigation list. */
export function spineStructuralTopPages<T extends SidebarNavItem>(
  pages: readonly T[],
): T[] {
  return pages.filter(isSpineMapTopRow);
}

/** Fixed utility rows at the absolute bottom of either sidebar renderer. */
export function spineStructuralBottomPages<T extends SidebarNavItem>(
  pages: readonly T[],
): T[] {
  const position = new Map([
    ['print-station', 0],
    ['reports', 1],
  ]);
  return pages
    .filter(isSpineBottomRow)
    .sort(
      (left, right) =>
        (position.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (position.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
}
