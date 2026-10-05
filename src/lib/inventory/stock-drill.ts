/**
 * The phone's stock walk as a drill-down — room › aisle › side › bay ›
 * location — instead of one long list (owner 2026-10-03). Pure folds over the
 * location summaries of ONE room; the room level itself is the room facets.
 * An aisle has two sides (odd bays left, even bays right); the operator picks
 * the side they stand facing before the bays list (owner 2026-10-03).
 */

import type { StockLocationSummary } from './stock-location-summary';
import { bayHand } from '@/lib/barcode-routing';
import { WAREHOUSE_PATHS } from '@/lib/nav/route-tree';

/** `aisle=other`: the room's places that are not room-coded (rack shelves, desks, named bins). */
export const STOCK_DRILL_OTHER = 'other';

/**
 * A stockable place off the aisle grid. An unresolved placement (no
 * `locations` row) is repair work with no address to walk to, never Other.
 */
function isOtherPlace(summary: StockLocationSummary): boolean {
  return summary.aisle == null && summary.locationId != null;
}

export type StockDrillAisle = number | typeof STOCK_DRILL_OTHER;

/** The side of an aisle: odd bays stand on the left, even bays on the right (`bayHand`). */
export type StockDrillSide = 'left' | 'right';

export function stockDrillSideOf(bay: number): StockDrillSide {
  return bayHand(bay) === 'Left' ? 'left' : 'right';
}

/** Where the walk stands; deeper fields are ignored without the shallower ones. */
export interface StockDrillScope {
  room: string | null;
  aisle: StockDrillAisle | null;
  /** Set by the side choice, or implied by an open bay's parity. */
  side: StockDrillSide | null;
  bay: number | null;
}

/** One row of an aisle or bay level: what is under it, at a glance. */
export interface StockDrillGroup {
  key: number;
  locations: number;
  /** Bays under an aisle, levels under a bay. */
  children: number;
  quantity: number;
  skuCount: number;
  hasOnHold: boolean;
  hasCleanup: boolean;
  hasException: boolean;
}

export function parseStockDrillScope(params: {
  room?: string | null;
  aisle?: string | null;
  side?: string | null;
  bay?: string | null;
}): StockDrillScope {
  const room = params.room?.trim() || null;
  const rawAisle = params.aisle?.trim() || '';
  const aisleNumber = /^\d{1,2}$/.test(rawAisle) ? Number(rawAisle) : null;
  const aisle: StockDrillAisle | null = !room ? null : rawAisle === STOCK_DRILL_OTHER ? STOCK_DRILL_OTHER : aisleNumber;
  const rawBay = params.bay?.trim() || '';
  const bay = typeof aisle === 'number' && /^\d{1,2}$/.test(rawBay) ? Number(rawBay) : null;
  const rawSide = params.side?.trim() || '';
  // An open bay names its own side; a side without an aisle means nothing.
  const side: StockDrillSide | null =
    bay != null ? stockDrillSideOf(bay) : typeof aisle === 'number' && (rawSide === 'left' || rawSide === 'right') ? rawSide : null;
  return { room, aisle, side, bay };
}

/** The URL of a drill level (`/m/stock?room=…&aisle=…&side=…&bay=…`). */
export function stockDrillHref(scope: Partial<StockDrillScope>): string {
  const params = new URLSearchParams();
  if (scope.room) {
    params.set('room', scope.room);
    if (scope.aisle != null) {
      params.set('aisle', String(scope.aisle));
      if (scope.aisle !== STOCK_DRILL_OTHER) {
        const side = scope.bay != null ? stockDrillSideOf(scope.bay) : scope.side;
        if (side) params.set('side', side);
        if (scope.bay != null) params.set('bay', String(scope.bay));
      }
    }
  }
  const query = params.toString();
  return query ? `${WAREHOUSE_PATHS.stock}?${query}` : WAREHOUSE_PATHS.stock;
}

function fold(key: number, members: readonly StockLocationSummary[], child: (s: StockLocationSummary) => number | null): StockDrillGroup {
  const skus = new Set<string>();
  for (const member of members) {
    for (const row of member.rows) if (row.qty > 0 && row.source !== 'empty' && row.sku.trim()) skus.add(row.sku.trim());
  }
  return {
    key,
    locations: members.length,
    children: new Set(members.map(child).filter((n) => n != null)).size,
    quantity: members.reduce((sum, member) => sum + member.quantity, 0),
    skuCount: skus.size,
    hasOnHold: members.some((member) => member.hasOnHold),
    hasCleanup: members.some((member) => member.hasCleanup),
    hasException: members.some((member) => member.hasException),
  };
}

function groupBy(
  summaries: readonly StockLocationSummary[],
  key: (s: StockLocationSummary) => number | null,
  child: (s: StockLocationSummary) => number | null,
): StockDrillGroup[] {
  const groups = new Map<number, StockLocationSummary[]>();
  for (const summary of summaries) {
    const k = key(summary);
    if (k == null) continue;
    const members = groups.get(k);
    if (members) members.push(summary);
    else groups.set(k, [summary]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([k, members]) => fold(k, members, child));
}

/** A room's aisles in order, plus how many of its places stand off the aisle grid. */
export function stockDrillAisles(summaries: readonly StockLocationSummary[]): { aisles: StockDrillGroup[]; other: number } {
  return {
    aisles: groupBy(summaries, (s) => s.aisle, (s) => s.bay),
    other: summaries.filter(isOtherPlace).length,
  };
}

/** One aisle's bays in order — one side only when `side` is given. */
export function stockDrillBays(summaries: readonly StockLocationSummary[], aisle: number, side?: StockDrillSide | null): StockDrillGroup[] {
  return groupBy(
    summaries.filter((s) => s.aisle === aisle && s.bay != null && (!side || stockDrillSideOf(s.bay) === side)),
    (s) => s.bay,
    (s) => s.level,
  );
}

/** An aisle's two sides at a glance (`children` = bays on that side); null when the side has no bay. */
export function stockDrillSides(
  summaries: readonly StockLocationSummary[],
  aisle: number,
): Record<StockDrillSide, StockDrillGroup | null> {
  const inAisle = summaries.filter((s) => s.aisle === aisle && s.bay != null);
  const side = (which: StockDrillSide) => {
    const members = inAisle.filter((s) => stockDrillSideOf(s.bay!) === which);
    return members.length ? fold(aisle, members, (s) => s.bay) : null;
  };
  return { left: side('left'), right: side('right') };
}

/** The places at one level of the walk, in walk order (level, then position). */
export function stockDrillLocations(summaries: readonly StockLocationSummary[], scope: StockDrillScope): StockLocationSummary[] {
  if (scope.aisle === STOCK_DRILL_OTHER) return summaries.filter(isOtherPlace);
  if (typeof scope.aisle !== 'number' || scope.bay == null) return [];
  return summaries
    .filter((s) => s.aisle === scope.aisle && s.bay === scope.bay)
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || (a.position ?? 0) - (b.position ?? 0));
}
