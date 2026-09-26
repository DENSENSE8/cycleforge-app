/** Group library photos into civil capture-day bands for the flat stream. */

import type { LibraryPhoto } from '@/components/photos/photo-library-types';
import { toPSTDateKey } from '@/utils/date';

interface PhotoCaptureDayGroup {
  /** `YYYY-MM-DD` in the warehouse zone — the band label + its date-filter value. */
  dateKey: string;
  photos: LibraryPhoto[];
}

/** Bucket photos into consecutive same-day runs, preserving the incoming order. */
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
