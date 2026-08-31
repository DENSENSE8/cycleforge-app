/**
 * Display Root Index rows shared by every `/search?sel=` entity.
 *
 * WHAT IS ACTUALLY SHARED
 *   Only the rows whose meaning does not depend on the entity. Today that is
 *   Photos, and it was written out twice — the same three-way subtitle ladder
 *   (loading → n photos → none) and the same "informational, never `action`"
 *   tone rule, verbatim, in the order builder and the unit builder. Two copies
 *   of one rule is one rule and one latent disagreement.
 *
 * WHAT IS DELIBERATELY NOT SHARED
 *   The leaf SETS. An order has Status info / Timeline / Units / Ticket /
 *   Support / Warranty; a unit has Journey / Order. Those are different
 *   questions about different things, and collapsing them into one builder
 *   behind a union of optional signals would make every caller pass fields it
 *   has no answer for — false uniformity, which is a worse fork than two honest
 *   lists. The entity builders stay; they compose from here.
 */

import type { DisplayIndexRow } from '@/components/station/displays';

export interface PhotosRowSignals {
  /** Photos found on the record. `null` while the query is in flight. */
  photoCount: number | null;
  /** Query settled — tone stays neutral rather than claiming zero early. */
  photosSettled: boolean;
}

/**
 * The Photos leaf row.
 *
 * Tone is `ok` only once the query has SETTLED and found something. An
 * unsettled query renders neutral and says "Loading…", because a row that
 * claims "No photos" before the answer is back is a wrong statement rather than
 * an incomplete one — and on a read surface it is never `action`, which would
 * tell an operator to go do something this pane cannot do.
 */
export function displayIndexPhotosRow(signals: PhotosRowSignals): DisplayIndexRow {
  const { photoCount, photosSettled } = signals;
  const has = Boolean(photosSettled && photoCount && photoCount > 0);

  return {
    id: 'photos',
    label: 'Photos',
    subtitle: !photosSettled
      ? 'Loading…'
      : photoCount && photoCount > 0
        ? `${photoCount} photo${photoCount === 1 ? '' : 's'}`
        : 'No photos',
    tone: has ? 'ok' : 'neutral',
    group: 'assets',
  };
}
