/**
 * Unboxed recent-rail facet filters — priority · type · platform.
 *
 * Local to the sidebar footer (not workbench `?ulane=` / `?priority_only=`).
 * Applied as a display keep-filter on already-fetched rail rows.
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { platformPriorityRank } from '@/lib/receiving/display/precedence';
import { PRIORITY_OVERRIDE_TIERS } from '@/lib/receiving/priority-override';
import { sourcePlatformLabel } from '@/lib/source-platform';

export interface UnboxRailFacets {
  /** Manual-tier vocabulary 0..3; null = all. */
  priorityTier: number | null;
  /** Uppercase receiving type (`PO` / `RETURN` / …); null = all. */
  receivingType: string | null;
  /** Lowercase `source_platform`; null = all. */
  platform: string | null;
}

export const EMPTY_UNBOX_RAIL_FACETS: UnboxRailFacets = {
  priorityTier: null,
  receivingType: null,
  platform: null,
};

export function unboxRailFacetsHot(facets: UnboxRailFacets): boolean {
  return (
    facets.priorityTier != null
    || facets.receivingType != null
    || facets.platform != null
  );
}

/** Rank → urgency pill tier (same map as CartonContextCard classify). */
const RANK_TO_TIER: Record<number, number> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 3 };

function rowIsUnmatched(row: ReceivingLineRow): boolean {
  return (row.receiving_source || '').trim().toLowerCase() === 'unmatched';
}

function effectivePriorityTier(row: ReceivingLineRow): number | null {
  if (row.priority_tier != null && Number.isFinite(row.priority_tier)) {
    return row.priority_tier;
  }
  const rank = platformPriorityRank(
    rowIsUnmatched(row),
    row.source_platform,
    row.is_priority,
  );
  return RANK_TO_TIER[rank] ?? null;
}

function effectiveReceivingType(row: ReceivingLineRow): string {
  return (
    row.receiving_type
    || row.carton_intake_type
    || 'PO'
  )
    .trim()
    .toUpperCase();
}

function effectivePlatform(row: ReceivingLineRow): string {
  return (row.source_platform || row.source_platform_pill || '').trim().toLowerCase();
}

/** Keep-filter for Unboxed rail facets. Empty facets → always true. */
export function matchesUnboxRailFacets(
  row: ReceivingLineRow,
  facets: UnboxRailFacets,
): boolean {
  if (facets.priorityTier != null) {
    if (effectivePriorityTier(row) !== facets.priorityTier) return false;
  }
  if (facets.receivingType != null) {
    if (effectiveReceivingType(row) !== facets.receivingType) return false;
  }
  if (facets.platform != null) {
    if (effectivePlatform(row) !== facets.platform) return false;
  }
  return true;
}

export function unboxRailFacetsHotLabel(facets: UnboxRailFacets): string | undefined {
  const parts: string[] = [];
  if (facets.priorityTier != null) {
    const tier = PRIORITY_OVERRIDE_TIERS.find((t) => t.value === facets.priorityTier);
    if (tier) parts.push(tier.label);
  }
  if (facets.receivingType) parts.push(facets.receivingType);
  if (facets.platform) {
    parts.push(sourcePlatformLabel(facets.platform));
  }
  return parts.length ? parts.join(' · ') : undefined;
}
