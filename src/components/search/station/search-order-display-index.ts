/**
 * `/search?sel=order:` Displays Root Index — enriched rows (no React).
 *
 * Sibling of `support-orders-display-index.ts`. These are the REFERENCE leaves
 * for an order in preview: everything the deleted two-column feedback body used
 * to stack in the centre now lives on the right edge, where the station
 * anatomy puts KNOW.
 *
 * Groups follow `defaultDisplayIndexGroup` so a leaf sits at the same ordinal
 * here as on every other station.
 */

import type { DisplayIndexRow } from '@/components/station/displays';
import { displayIndexPhotosRow } from './search-display-index-rows';

export interface SearchOrderDisplaySignals {
  /** Order # present — the anchor Support/Ticket leaves resolve against. */
  hasOrderNumber: boolean;
  /** Photos found on the order (unit evidence + legacy packer urls). */
  photoCount: number | null;
  /** Photo query still in flight — tone stays neutral rather than claiming zero. */
  photosSettled: boolean;
  hasWarrantyOrReturns: boolean;
  /**
   * Serials on the order. Zero means the `units` leaf is not built at all
   * (`visible: false` in `buildSectionTabs`), so its row must not be emitted —
   * an index row whose leaf does not exist navigates nowhere.
   */
  serialCount: number;
}

export function buildSearchOrderDisplayIndexRows(
  signals: SearchOrderDisplaySignals,
): DisplayIndexRow[] {
  const { hasOrderNumber, photoCount, photosSettled, hasWarrantyOrReturns, serialCount } =
    signals;

  return [
    displayIndexPhotosRow({ photoCount, photosSettled }),
    {
      id: 'status',
      label: 'Status info',
      subtitle: 'Shipping · serials · commercial',
      tone: 'neutral',
      // Extended status lives on the edge. Neither half of Status is in the
      // centre — the packout stepper and the activity trail are both the
      // `timeline` leaf's, not this one's.
      group: 'context',
    },
    {
      id: 'timeline',
      label: 'Timeline',
      subtitle: 'Pipeline · activity trail',
      tone: 'neutral',
      group: 'context',
    },
    ...(serialCount > 0
      ? ([
          {
            id: 'units',
            label: 'Units',
            subtitle: `${serialCount} serial${serialCount === 1 ? '' : 's'}`,
            // Presence of units is informational on a read surface, same rule
            // as Photos — never `action`.
            tone: 'ok',
            // `assets`, matching `defaultDisplayIndexGroup('units')`. It read
            // `context` until 2026-08-21, which put Units in a different band
            // from Photos on /search than on every station that takes the
            // default — the row moved column for no stated reason.
            group: 'assets',
          },
        ] satisfies DisplayIndexRow[])
      : []),
    {
      id: 'ticket',
      label: 'Customer ticket',
      subtitle: hasOrderNumber ? 'Customer thread' : 'No order # to anchor',
      tone: hasOrderNumber ? 'ok' : 'neutral',
      group: 'context',
    },
    {
      id: 'support',
      label: 'Support',
      subtitle: 'Team · Activity',
      tone: 'neutral',
      group: 'context',
    },
    {
      id: 'warranty',
      label: 'Warranty',
      subtitle: hasWarrantyOrReturns ? 'Claims · returns' : 'No claim on file',
      tone: 'neutral',
      group: 'context',
    },
  ];
}
