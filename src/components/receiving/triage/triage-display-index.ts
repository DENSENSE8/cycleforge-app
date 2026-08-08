/**
 * Arrival Displays Root Index — Pairing-only enrichment (no React).
 */

import type { DisplayIndexRow } from '@/components/station/displays';

export function buildTriageDisplayIndexRows(signals: {
  linkagePaired: boolean;
  isUnfound: boolean;
}): DisplayIndexRow[] {
  if (signals.linkagePaired) {
    return [
      {
        id: 'linkage',
        label: 'Pairing',
        subtitle: 'Paired',
        tone: 'ok',
        group: 'verification',
      },
    ];
  }
  if (signals.isUnfound) {
    return [
      {
        id: 'linkage',
        label: 'Pairing',
        subtitle: 'Unpaired',
        tone: 'action',
        group: 'verification',
      },
    ];
  }
  return [
    {
      id: 'linkage',
      label: 'Pairing',
      subtitle: 'Store · PO',
      tone: 'neutral',
      group: 'verification',
    },
  ];
}
