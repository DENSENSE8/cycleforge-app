/** The allocation MATCH: */

import {
  GRADE_ORDER,
  GRADE_RANK,
  gradeMeetsSoldTier,
  normalizeSoldTier,
  type ConditionGrade,
  type TierVerdict,
} from '@/lib/orders/condition-tier';

export interface AllocationDemandLine {
  orderId: number;
  orderNumber: string;
  /** Catalog SKU. null when the line was never paired — an allocation blocker. */
  sku: string | null;
  quantity: number;
  /** Raw `orders.condition` free text; normalized here, not by the caller. */
  soldCondition: string | null;
}

export interface AllocationSupplyUnit {
  serialUnitId: number;
  sku: string;
  grade: ConditionGrade | null;
  location: string | null;
}

export type ShortfallReason =
  | 'NO_SKU'
  | 'NO_STOCK'
  | 'PARTIAL'
  | 'TIER_UNMET'
  | 'UNGRADED_ONLY';

export interface AllocationShortfall {
  orderId: number;
  orderNumber: string;
  sku: string | null;
  needed: number;
  matched: number;
  reason: ShortfallReason;
  detail: string;
}

export interface AllocationPlan {
  allocations: Array<{ orderId: number; serialUnitId: number }>;
  shortfalls: AllocationShortfall[];
}

/**
 * Ungraded units sort after every grade. They can never pass the tier gate
 * (`gradeMeetsSoldTier` refuses an unknown grade), so ordering them last stops
 * a usable graded unit from queueing behind one that will only be refused.
 */
const UNGRADED_SORT_RANK = GRADE_ORDER.length;

const sortRank = (grade: ConditionGrade | null): number =>
  grade ? GRADE_RANK[grade] : UNGRADED_SORT_RANK;

/** Candidate order within one SKU: */
function compareCandidates(a: AllocationSupplyUnit, b: AllocationSupplyUnit): number {
  const byGrade = sortRank(a.grade) - sortRank(b.grade);
  if (byGrade !== 0) return byGrade;
  const byLocation = (a.location ?? '').localeCompare(b.location ?? '');
  if (byLocation !== 0) return byLocation;
  return a.serialUnitId - b.serialUnitId;
}

/** A blank, fractional or nonsense quantity still means one physical unit. */
function unitsNeeded(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.max(1, Math.floor(quantity));
}

/** Assign units to lines. */
export function planAllocations(
  demand: readonly AllocationDemandLine[],
  supply: readonly AllocationSupplyUnit[],
): AllocationPlan {
  // Whatever SKUs are on the shelf today — a runtime-built index, not a static
  // lookup table, so Map.
  const bySku = new Map<string, AllocationSupplyUnit[]>();
  for (const unit of supply) {
    const sku = unit.sku.trim();
    if (!sku) continue;
    const bucket = bySku.get(sku);
    if (bucket) bucket.push(unit);
    else bySku.set(sku, [unit]);
  }
  for (const bucket of bySku.values()) bucket.sort(compareCandidates);

  const allocations: AllocationPlan['allocations'] = [];
  const shortfalls: AllocationShortfall[] = [];
  const consumed = new Set<number>();

  for (const demandLine of demand) {
    const needed = unitsNeeded(demandLine.quantity);
    const short = (reason: ShortfallReason, matched: number, detail: string): void => {
      shortfalls.push({
        orderId: demandLine.orderId,
        orderNumber: demandLine.orderNumber,
        sku: demandLine.sku,
        needed,
        matched,
        reason,
        detail,
      });
    };

    const sku = (demandLine.sku ?? '').trim();
    if (!sku) {
      short('NO_SKU', 0, 'Order line has no SKU — pair it to the catalog before it can be allocated.');
      continue;
    }

    const stocked = bySku.get(sku) ?? [];
    const candidates = stocked.filter((unit) => !consumed.has(unit.serialUnitId));
    if (candidates.length === 0) {
      // Two operator stories, one reason. Name which: "buy more" and "an
      // earlier order took it" are different next actions.
      short(
        'NO_STOCK',
        0,
        stocked.length === 0
          ? `No stocked unit of ${sku} is in a pickable bin.`
          : `All ${stocked.length} stocked unit(s) of ${sku} were committed to earlier lines in this run.`,
      );
      continue;
    }

    const soldTier = normalizeSoldTier(demandLine.soldCondition);
    const taken: number[] = [];
    let firstRefusal: TierVerdict | null = null;
    for (const unit of candidates) {
      if (taken.length >= needed) break;
      const verdict = gradeMeetsSoldTier(unit.grade, soldTier);
      if (!verdict.ok) {
        firstRefusal ??= verdict;
        continue;
      }
      taken.push(unit.serialUnitId);
    }

    for (const serialUnitId of taken) {
      consumed.add(serialUnitId);
      allocations.push({ orderId: demandLine.orderId, serialUnitId });
    }

    if (taken.length >= needed) continue;

    if (taken.length > 0) {
      const gap = `Allocated ${taken.length} of ${needed} unit(s) of ${sku}; ${needed - taken.length} still short.`;
      short('PARTIAL', taken.length, firstRefusal ? `${gap} Nearest refusal: ${firstRefusal.message}` : gap);
      continue;
    }

    // Ungraded-only is its own reason because the fix is "grade a unit", not
    // "buy a better one".
    if (candidates.every((unit) => !unit.grade)) {
      short(
        'UNGRADED_ONLY',
        0,
        `All ${candidates.length} stocked unit(s) of ${sku} are ungraded — grade one before it can be allocated.`,
      );
      continue;
    }

    short('TIER_UNMET', 0, firstRefusal?.message ?? `No stocked unit of ${sku} meets the sold condition.`);
  }

  return { allocations, shortfalls };
}
