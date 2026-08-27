/**
 * Derive GaugeDonut / DistributionTable rows from packing KPI counts.
 * Weighted minutes use DEFAULT_TIER_MINUTES (same as /api/packing/kpi).
 */

import { DEFAULT_TIER_MINUTES } from '@/lib/packing/pack-tier-classifier';
import type { GaugeSegment } from './charts/GaugeDonut';
import type { DistributionRow } from './charts/DistributionTable';
import { PACK_CAPACITY_TONES, PACK_TIER_TONES } from './charts/chart-theme';

type PackTierCounts = {
  small_count: number;
  medium_count: number;
  large_count: number;
};

function safeCount(n: number | null | undefined): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export function tierMinutesFromCounts(counts: PackTierCounts): {
  small: number;
  medium: number;
  large: number;
  total: number;
} {
  const small = safeCount(counts.small_count) * DEFAULT_TIER_MINUTES.SMALL;
  const medium = safeCount(counts.medium_count) * DEFAULT_TIER_MINUTES.MEDIUM;
  const large = safeCount(counts.large_count) * DEFAULT_TIER_MINUTES.LARGE;
  return { small, medium, large, total: small + medium + large };
}

export function packingBoxesByTierSegments(counts: PackTierCounts): GaugeSegment[] {
  return [
    {
      key: 'SMALL',
      label: 'Small',
      value: safeCount(counts.small_count),
      color: PACK_TIER_TONES.SMALL,
    },
    {
      key: 'MEDIUM',
      label: 'Medium',
      value: safeCount(counts.medium_count),
      color: PACK_TIER_TONES.MEDIUM,
    },
    {
      key: 'LARGE',
      label: 'Large',
      value: safeCount(counts.large_count),
      color: PACK_TIER_TONES.LARGE,
    },
  ];
}

export function packingMinutesByTierSegments(counts: PackTierCounts): GaugeSegment[] {
  const m = tierMinutesFromCounts(counts);
  return [
    { key: 'SMALL', label: 'Small', value: m.small, color: PACK_TIER_TONES.SMALL },
    { key: 'MEDIUM', label: 'Medium', value: m.medium, color: PACK_TIER_TONES.MEDIUM },
    { key: 'LARGE', label: 'Large', value: m.large, color: PACK_TIER_TONES.LARGE },
  ];
}

export function packingCapacitySegments(args: {
  weightedMinutes: number;
  dailyCapacityMinutes: number;
}): GaugeSegment[] {
  const capacity = Math.max(0, Math.floor(Number(args.dailyCapacityMinutes) || 0));
  const used = Math.max(0, Math.floor(Number(args.weightedMinutes) || 0));
  const remaining = Math.max(0, capacity - used);
  return [
    { key: 'used', label: 'Used', value: used, color: PACK_CAPACITY_TONES.used },
    { key: 'remaining', label: 'Remaining', value: remaining, color: PACK_CAPACITY_TONES.remaining },
  ];
}

export function packingBoxesDistributionRows(counts: PackTierCounts): DistributionRow[] {
  const segments = packingBoxesByTierSegments(counts);
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  return segments
    .filter((s) => s.value > 0)
    .map((s) => ({
      key: s.key,
      label: s.label,
      count: s.value,
      percent: total > 0 ? Math.round((s.value / total) * 1000) / 10 : 0,
      color: s.color,
    }));
}
