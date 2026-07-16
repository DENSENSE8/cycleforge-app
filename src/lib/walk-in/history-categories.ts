/**
 * Walk-In history categories — Monitor/Workbench on `/walk-in` after tasks
 * moved to the Receiving Walk-In station (`/pickup?job=`).
 */

import { DollarSign, Package, Wrench } from '@/components/Icons';
import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';

export const WALK_IN_HISTORY_CATEGORIES = ['repairs', 'sales', 'pickups'] as const;
export type WalkInHistoryCategory = (typeof WALK_IN_HISTORY_CATEGORIES)[number];

export const DEFAULT_WALK_IN_HISTORY_CATEGORY: WalkInHistoryCategory = 'repairs';

export const WALK_IN_HISTORY_ITEMS: HorizontalSliderItem[] = [
  { id: 'repairs', label: 'Repairs', icon: Wrench },
  { id: 'sales', label: 'Sales', icon: DollarSign },
  { id: 'pickups', label: 'Pickups', icon: Package },
];

export function isWalkInHistoryCategory(
  value: string | null | undefined,
): value is WalkInHistoryCategory {
  return (
    value != null &&
    (WALK_IN_HISTORY_CATEGORIES as readonly string[]).includes(value)
  );
}

export function parseWalkInHistoryCategory(
  raw: string | null | undefined,
): WalkInHistoryCategory {
  // Legacy `?tab=done|active|incoming` maps to repairs history.
  if (raw === 'done' || raw === 'active' || raw === 'incoming') return 'repairs';
  // Legacy `?mode=sales` is redirected to the station; if it lands here, show sales.
  if (raw === 'sales') return 'sales';
  return isWalkInHistoryCategory(raw) ? raw : DEFAULT_WALK_IN_HISTORY_CATEGORY;
}
