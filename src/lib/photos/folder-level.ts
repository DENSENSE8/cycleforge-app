/**
 * Folder-browse level for Media Library aggregation API.
 * Maps URL date path → which GROUP BY the folders endpoint runs.
 */

import { describePhotoDatePath } from '@/lib/photos/date-hierarchy';

export type PhotoLibraryFolderLevel = 'year' | 'month' | 'week' | 'day' | 'entity';

const PHOTO_LIBRARY_FOLDER_LEVELS: readonly PhotoLibraryFolderLevel[] = [
  'year',
  'month',
  'week',
  'day',
  'entity',
];

export function isPhotoLibraryFolderLevel(raw: string | null | undefined): raw is PhotoLibraryFolderLevel {
  return typeof raw === 'string' && (PHOTO_LIBRARY_FOLDER_LEVELS as readonly string[]).includes(raw);
}

/** Derive aggregation level (and whether the UI is at a photo leaf) from URL filters. */
export function resolvePhotoLibraryFolderLevel(filters: {
  dateFrom?: string;
  dateTo?: string;
  poRef?: string;
  ticketId?: string;
  receivingId?: string;
  poFinder?: string;
}): { level: PhotoLibraryFolderLevel; isLeaf: boolean; eyebrow: string } {
  if (
    filters.poRef?.trim() ||
    filters.ticketId?.trim() ||
    filters.receivingId?.trim() ||
    filters.poFinder?.trim()
  ) {
    return { level: 'entity', isLeaf: true, eyebrow: 'Photos' };
  }

  const path = describePhotoDatePath({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });

  if (path.length === 0) {
    return { level: 'year', isLeaf: false, eyebrow: 'Years' };
  }

  const deepest = path[path.length - 1]!.key;
  if (deepest === 'custom') {
    return { level: 'day', isLeaf: true, eyebrow: 'Photos' };
  }
  if (deepest === 'day') {
    return { level: 'entity', isLeaf: false, eyebrow: 'Folders' };
  }
  if (deepest === 'week') {
    return { level: 'day', isLeaf: false, eyebrow: 'Days' };
  }
  if (deepest === 'month') {
    return { level: 'week', isLeaf: false, eyebrow: 'Weeks' };
  }
  // year
  return { level: 'month', isLeaf: false, eyebrow: 'Months' };
}
