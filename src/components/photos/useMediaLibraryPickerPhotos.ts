'use client';

import { useMemo } from 'react';
import type { PhotoDateNav } from '@/components/photos/photo-library-grid/types';
import { usePhotoLibrary } from '@/hooks/usePhotoLibrary';
import {
  PHOTO_LIBRARY_FOLDER_LEAF_PAGE_SIZE,
  PHOTO_LIBRARY_PAGE_SIZE,
  type PhotoLibraryFilterState,
  type PhotoLibrarySourceScope,
} from '@/lib/photos/library-filter-state';
import { getCurrentPSTDateKey } from '@/utils/date';

interface MediaTypeSelection {
  scope?: PhotoLibrarySourceScope;
  imageType?: string;
}

interface BuildMediaLibraryPickerFiltersArgs {
  mediaType: MediaTypeSelection | null;
  ticketTab: boolean;
  /** Carton-scoped tab — filters by receivingId. */
  cartonTab: boolean;
  /** Support-item tab — the item's primary task media (WORK_ASSIGNMENT). */
  supportTab?: boolean;
  ticketId?: number;
  receivingId?: number;
  /** The Support item's primary task (`work_assignments.id`). */
  supportTaskId?: number;
  dateNav: PhotoDateNav;
  search?: string;
}

/**
 * Rolling window for picker search without an explicit date drill — bounds
 * unbounded q= scans. Folder browse no longer needs this (aggregation API).
 */
function searchFetchDateRange(): Pick<PhotoLibraryFilterState, 'dateFrom' | 'dateTo'> {
  const today = getCurrentPSTDateKey();
  const end = new Date(`${today}T12:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: ymd(start), dateTo: today };
}

/** Build library filters for the media picker (shared by folders + photo hooks). */
export function buildMediaLibraryPickerFilters({
  mediaType,
  ticketTab,
  cartonTab,
  supportTab,
  ticketId,
  receivingId,
  supportTaskId,
  dateNav,
  search,
}: BuildMediaLibraryPickerFiltersArgs): PhotoLibraryFilterState | null {
  if (ticketTab) {
    if (!ticketId) return null;
    const base: PhotoLibraryFilterState = {
      sourceScope: 'claims',
      ticketId: String(ticketId),
    };
    if (dateNav.dateFrom && dateNav.dateTo) {
      base.dateFrom = dateNav.dateFrom;
      base.dateTo = dateNav.dateTo;
    }
    return base;
  }

  if (cartonTab) {
    if (!receivingId) return null;
    const base: PhotoLibraryFilterState = {
      receivingId: String(receivingId),
    };
    if (dateNav.dateFrom && dateNav.dateTo) {
      base.dateFrom = dateNav.dateFrom;
      base.dateTo = dateNav.dateTo;
    }
    if (dateNav.poRef) base.poRef = dateNav.poRef;
    return base;
  }

  if (supportTab) {
    if (!supportTaskId) return null;
    const base: PhotoLibraryFilterState = { taskId: String(supportTaskId) };
    if (dateNav.dateFrom && dateNav.dateTo) {
      base.dateFrom = dateNav.dateFrom;
      base.dateTo = dateNav.dateTo;
    }
    return base;
  }

  if (!mediaType) return null;

  const base: PhotoLibraryFilterState = {};
  if (mediaType.scope) base.sourceScope = mediaType.scope;
  if (mediaType.imageType) base.imageType = mediaType.imageType;

  if (search?.trim()) {
    const trimmed = search.trim();
    // Prefer the structured finder (PO / tracking / ticket / …) over free-text
    // `q=` — ticket numbers never match OCR/po_ref-only searchPhotos().
    base.poFinder = trimmed;
    base.poFinderKind =
      mediaType.scope === 'claims' || ticketTab ? 'ticket' : 'any';
    if (dateNav.dateFrom && dateNav.dateTo) {
      base.dateFrom = dateNav.dateFrom;
      base.dateTo = dateNav.dateTo;
    } else {
      Object.assign(base, searchFetchDateRange());
    }
    return base;
  }

  if (dateNav.dateFrom && dateNav.dateTo) {
    base.dateFrom = dateNav.dateFrom;
    base.dateTo = dateNav.dateTo;
  }
  if (dateNav.poRef) base.poRef = dateNav.poRef;
  if (dateNav.ticketId) base.ticketId = dateNav.ticketId;
  return base;
}

interface UseMediaLibraryPickerPhotosArgs extends BuildMediaLibraryPickerFiltersArgs {
  enabled: boolean;
  /** Defaults to folder-leaf size (5). Search uses the grid page size. */
  pageSize?: number;
}

/**
 * Paginated library photos for the media picker leaf / search.
 * Non-leaf folder browse should use {@link usePhotoLibraryFolders} instead —
 * do not enable this hook just to paint year/month tiles.
 */
export function useMediaLibraryPickerPhotos(args: UseMediaLibraryPickerPhotosArgs) {
  const filters = useMemo(
    () => buildMediaLibraryPickerFilters(args),
    [
      args.mediaType,
      args.ticketTab,
      args.cartonTab,
      args.supportTab,
      args.ticketId,
      args.receivingId,
      args.supportTaskId,
      args.dateNav,
      args.search,
    ],
  );

  const searchActive = Boolean(args.search?.trim());
  const pageSize =
    args.pageSize ??
    (searchActive ? PHOTO_LIBRARY_PAGE_SIZE : PHOTO_LIBRARY_FOLDER_LEAF_PAGE_SIZE);

  const emptyFilters = useMemo<PhotoLibraryFilterState>(() => ({}), []);
  const { query, photos, isSettled } = usePhotoLibrary(filters ?? emptyFilters, {
    pageSize,
    enabled: args.enabled && filters !== null,
  });

  return { filters, photos, query, isSettled, pageSize };
}
