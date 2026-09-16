/**
 * Client-side find for the painted photo library rows.
 *
 * Typing in the library find-bar must NOT navigate or refetch: it narrows the
 * photos already on screen, exactly the way the slot `DataTable` desks narrow
 * theirs ({@link ../orders/filter-painted-orders.ts | filterShippedOrdersByQuery},
 * `receivingLineMatchesQuery`). Writing the box to the URL is the named
 * anti-pattern — a soft-nav remount per keystroke — pinned by
 * `src/lib/tables/data-table-search-url.guard.test.ts`.
 *
 * The haystack is the row's PAINTED identity plus the identifiers the finder
 * kind menu advertises, so a hit is always something the operator can read off
 * the list row (file name, `SKU · serial` meta line, ref label) or something
 * they explicitly scoped the field to.
 */
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

/**
 * The identifier facts one field-scope may match.
 *
 * `order` and `po` resolve to the same fact on purpose: a library row carries
 * ONE reference (`poRef`), and the scope it was captured under decides whether
 * that reference reads as a PO (unboxing) or an order (packing) — see
 * `PhotoLibraryGrid`'s tile-label contract.
 */
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
