/**
 * Sales (front-desk transaction history) categories — the Monitor on `/walk-in`
 * after tasks moved to the Walk-In station (`/pickup?job=`).
 *
 * `all` is the default: the page is the overall transaction history for every
 * front-desk category. Sales / Pickups / Repairs narrow that same feed.
 */

import { DollarSign, Layers, Package, Wrench } from '@/components/Icons';
import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';

export const WALK_IN_HISTORY_CATEGORIES = ['all', 'sales', 'pickups', 'repairs'] as const;
export type WalkInHistoryCategory = (typeof WALK_IN_HISTORY_CATEGORIES)[number];

export const DEFAULT_WALK_IN_HISTORY_CATEGORY: WalkInHistoryCategory = 'all';

export const WALK_IN_HISTORY_ITEMS: HorizontalSliderItem[] = [
  { id: 'all', label: 'All', icon: Layers },
  { id: 'sales', label: 'Sales', icon: DollarSign },
  { id: 'pickups', label: 'Pickups', icon: Package },
  { id: 'repairs', label: 'Repairs', icon: Wrench },
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
  // Legacy `?tab=done|active|incoming` deep-links were repair-scoped.
  if (raw === 'done' || raw === 'active' || raw === 'incoming') return 'repairs';
  // Legacy `?mode=sales` is redirected to the station; if it lands here, show sales.
  if (raw === 'sales') return 'sales';
  return isWalkInHistoryCategory(raw) ? raw : DEFAULT_WALK_IN_HISTORY_CATEGORY;
}
