/** Client-side find for the painted photo library rows. */
import type { LibraryPhoto } from '@/components/photos/photo-library-types';
import {
  photoFileName,
  photoIdentityLine,
  photoPrimaryLabel,
} from '@/lib/photos/display-names';
import type {
  PhotoLibrarySourceScope,
  PhotoSearchField,
} from '@/lib/photos/library-filter-state';

type Fact = string | number | null | undefined;

export interface PhotoFindOptions {
  /** Scope the row paints under — drives ticket-vs-PO naming. */
  scope?: PhotoLibrarySourceScope;
  /** Field the finder-kind menu has pinned. `all` searches every painted fact. */
  field?: PhotoSearchField;
}

/** The identifier facts one field-scope may match. */
function scopedFacts(photo: LibraryPhoto, field: Exclude<PhotoSearchField, 'all'>): Fact[] {
  switch (field) {
    case 'po':
    case 'order':
      return [photo.poRef, photo.poRef ? `po ${photo.poRef}` : null];
    case 'tracking':
      return [photo.tracking];
    case 'serial':
      return [photo.serialNumber, photo.unitUid];
    case 'sku':
      return [photo.sku];
    case 'ticket':
      return [photo.ticketId, photo.ticketId != null ? `#${photo.ticketId}` : null];
    case 'repair':
      return [photo.poRef, photo.sourceScope === 'repair' ? photo.poRef : null];
    case 'customer':
      // Customer name is a server-side repair_service join, not a painted
      // library-row fact — client find has nothing to match.
      return [];
  }
}

/** Every fact an unscoped find may match — painted labels first, then ids. */
function allFacts(photo: LibraryPhoto, scope: PhotoLibrarySourceScope): Fact[] {
  return [
    photoFileName(photo, scope),
    photoPrimaryLabel(photo, scope),
    photoIdentityLine(photo),
    photo.poRef,
    photo.tracking,
    photo.sku,
    photo.serialNumber,
    photo.unitUid,
    photo.ticketId,
    photo.caption,
    photo.filename,
    photo.photoType?.replace(/_/g, ' '),
    photo.documentType?.replace(/_/g, ' '),
    photo.platform,
    photo.takenByStaffName,
    ...(photo.labels ?? []).flatMap((label) => [label.label, label.key]),
    photo.id,
  ];
}

/** Lowercased newline-joined haystack for one row under one field scope. */
export function photoSearchHaystack(
  photo: LibraryPhoto,
  options: PhotoFindOptions = {},
): string {
  const scope = options.scope ?? 'all';
  const field = options.field ?? 'all';
  const facts = field === 'all' ? allFacts(photo, scope) : scopedFacts(photo, field);
  return facts
    .filter((fact): fact is string | number => fact != null && String(fact).trim() !== '')
    .join('\n')
    .toLowerCase();
}

/** True when the row's painted facts contain the query (empty query matches). */
export function photoMatchesQuery(
  photo: LibraryPhoto,
  query: string,
  options: PhotoFindOptions = {},
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return photoSearchHaystack(photo, options).includes(needle);
}

/** Narrow the loaded stream to the rows the find-bar matches. */
export function filterPhotosByQuery(
  photos: readonly LibraryPhoto[],
  query: string,
  options: PhotoFindOptions = {},
): LibraryPhoto[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...photos];
  return photos.filter((photo) => photoSearchHaystack(photo, options).includes(needle));
}
