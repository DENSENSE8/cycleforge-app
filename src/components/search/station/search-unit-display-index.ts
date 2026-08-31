/**
 * `/search?sel=unit:` Displays Root Index — enriched rows (no React).
 *
 * Sibling of `search-order-display-index.ts`. These are the REFERENCE leaves
 * for a serial unit in preview: everything ABOUT the unit that is not intrinsic
 * to its identity — where it has been, what was photographed, what it is
 * allocated to — lives on the right edge, where the station anatomy puts KNOW.
 *
 * Groups follow `defaultDisplayIndexGroup` so a leaf sits at the same ordinal
 * here as on every other station.
 */

import type { DisplayIndexRow } from '@/components/station/displays';
import { displayIndexPhotosRow } from './search-display-index-rows';

export interface SearchUnitDisplaySignals {
  /** A real serial (not a minted uid) — the journey spine keys on it. */
  hasSerial: boolean;
  /** Stage photos found on the unit. `null` while the query is in flight. */
  photoCount: number | null;
  /** Photo query settled — tone stays neutral rather than claiming zero. */
  photosSettled: boolean;
  /** Unit is allocated / shipped against an order. */
  hasOrder: boolean;
}

export function buildSearchUnitDisplayIndexRows(
  signals: SearchUnitDisplaySignals,
): DisplayIndexRow[] {
  const { hasSerial, photoCount, photosSettled, hasOrder } = signals;

  return [
    displayIndexPhotosRow({ photoCount, photosSettled }),
    {
      id: 'journey',
      label: 'Journey',
      // A minted uid has no journey spine to query — say so rather than open a
      // leaf that can only ever be empty.
      subtitle: hasSerial ? 'Every scan, in order' : 'No serial to trace',
      tone: hasSerial ? 'ok' : 'neutral',
      group: 'context',
    },
    {
      id: 'order',
      label: 'Order',
      subtitle: hasOrder ? 'Allocated · shipped' : 'Not allocated',
      tone: hasOrder ? 'ok' : 'neutral',
      group: 'context',
    },
  ];
}
