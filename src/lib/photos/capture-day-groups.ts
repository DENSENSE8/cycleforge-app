/**
 * Group library photos into civil capture-day bands for the flat stream.
 *
 * The flat reverse-chronological stream replaced the Year › Month › Week › Day
 * folder drill. Day *bands* are what survives of that hierarchy: they keep the
 * stream scannable ("what came in Tuesday?") without making the calendar a
 * location you have to descend into. The band is a label, not a folder.
 *
 * **Groups in array order — this function does not sort.** The server already
 * ordered the rows (`?sort=recent|oldest`), so consuming that order verbatim is
 * what keeps the bands consistent with the active sort: flipping to `oldest`
 * re-orders the days for free. Sorting here would silently pin the stream to
 * newest-first and quietly contradict the sort control. Same contract as the
 * shared `EventTimeline`, which also day-groups in array order.
 *
 * Civil day comes from `toPSTDateKey` (the warehouse-zone SoT in
 * `src/utils/date.ts`) — never a host-local `getDate()`, which would bucket an
 * evening capture into the wrong day for anyone outside the warehouse zone.
 */

import type { LibraryPhoto } from '@/components/photos/photo-library-types';
import { toPSTDateKey } from '@/utils/date';

export interface PhotoCaptureDayGroup {
  /** `YYYY-MM-DD` in the warehouse zone — the band label + its date-filter value. */
  dateKey: string;
  photos: LibraryPhoto[];
}

/**
 * Bucket photos into consecutive same-day runs, preserving the incoming order.
 *
 * A photo whose `createdAt` cannot be parsed keeps its position in the stream
 * rather than being dropped — evidence must never silently disappear from the
 * library because of one bad timestamp. Such rows collect under an empty
 * `dateKey`, which the renderer shows as an untitled band.
 */
export function groupPhotosByCaptureDay(photos: LibraryPhoto[]): PhotoCaptureDayGroup[] {
  const groups: PhotoCaptureDayGroup[] = [];

  for (const photo of photos) {
    // toPSTDateKey returns '' for an unparseable instant — keep the row, band it
    // separately rather than coercing it onto a neighbouring (wrong) day.
    const dateKey = photo.createdAt ? toPSTDateKey(photo.createdAt) : '';
    const open = groups[groups.length - 1];
    // Only a RUN of the same day merges. A stream sorted by something other than
    // time can legitimately revisit a day later; those become distinct bands
    // instead of being teleported backwards into the earlier one.
    if (open && open.dateKey === dateKey) {
      open.photos.push(photo);
    } else {
      groups.push({ dateKey, photos: [photo] });
    }
  }

  return groups;
}
