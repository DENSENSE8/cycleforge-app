'use client';

/**
 * Look tab stub for closed parked strips. {@link StationDisplaysPushStack}
 * always replaces this with {@link StationLookDisplayHost} so a station that
 * lists Look for the icon rail cannot ship an empty leaf.
 */

import { Layers } from '@/components/Icons';
import type { SectionTab } from '@/design-system/components';
import { STATION_LOOK_DISPLAY_ID } from './display-index';

export const LOOK_DISPLAY_TAB_STUB: SectionTab = {
  id: STATION_LOOK_DISPLAY_ID,
  label: 'Look',
  icon: Layers,
  content: null,
};

export function withLookDisplayTabs(tabs: readonly SectionTab[]): SectionTab[] {
  const rest = tabs.filter((t) => t.id !== STATION_LOOK_DISPLAY_ID);
  return [...rest, LOOK_DISPLAY_TAB_STUB];
}
