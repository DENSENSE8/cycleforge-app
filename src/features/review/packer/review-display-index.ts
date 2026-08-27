/**
 * Packer review Displays Root Index — enriched rows (no React).
 */

import type { DisplayIndexRow } from '@/components/station/displays';

export function buildReviewDisplayIndexRows(signals: {
  photoCount: number;
  trackingPresent: boolean;
  hasTimeline: boolean;
}): DisplayIndexRow[] {
  const rows: DisplayIndexRow[] = [
    {
      id: 'photos',
      label: 'Photos',
      subtitle:
        signals.photoCount <= 0
          ? 'None yet'
          : signals.photoCount === 1
            ? '1 photo'
            : `${signals.photoCount} photos`,
      tone: signals.photoCount > 0 ? 'ok' : 'action',
      group: 'assets',
    },
    {
      id: 'tracking',
      label: 'Tracking',
      subtitle: signals.trackingPresent ? 'Tracking on file' : 'No tracking',
      tone: signals.trackingPresent ? 'ok' : 'action',
      group: 'context',
    },
  ];
  if (signals.hasTimeline) {
    rows.push({
      id: 'timeline',
      label: 'Timeline',
      subtitle: 'Order history',
      tone: 'neutral',
      group: 'context',
    });
  }
  return rows;
}
