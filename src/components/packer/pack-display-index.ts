/**
 * Pack Displays Root Index — scan/pack only (no Ticket · Support).
 * Order: Photos → Timeline → Listings (trailing upgrade slot).
 */

import type { DisplayIndexRow } from '@/components/station/displays';

interface PackDisplayIndexSignals {
  photosVisible: boolean;
  hasTimeline: boolean;
  packedCount: number;
  totalCount: number;
  /** Derived storefront URL present for the active SKU / item. */
  hasListing: boolean;
}

export function buildPackDisplayIndexRows(
  signals: PackDisplayIndexSignals,
): DisplayIndexRow[] {
  const rows: DisplayIndexRow[] = [];
  if (signals.photosVisible) {
    rows.push({
      id: 'photos',
      label: 'Photos',
      subtitle: 'Pack unit photos',
      tone: 'ok',
      group: 'assets',
    });
  }
  if (signals.hasTimeline) {
    const { packedCount, totalCount } = signals;
    rows.push({
      id: 'timeline',
      label: 'Timeline',
      subtitle:
        totalCount > 0
          ? `${packedCount}/${totalCount} packed`
          : 'Order history',
      tone:
        totalCount > 0 && packedCount >= totalCount
          ? 'ok'
          : 'neutral',
      group: 'context',
    });
  }
  rows.push({
    id: 'listings',
    label: 'Listings',
    subtitle: signals.hasListing ? 'Listing links' : 'No listing',
    tone: signals.hasListing ? 'ok' : 'neutral',
    // Context last — defaultDisplayIndexGroup('listings') is verification and
    // would hoist Listings above Photos / Timeline.
    group: 'context',
  });
  return rows;
}
