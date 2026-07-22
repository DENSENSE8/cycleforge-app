'use client';

import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import type { LibraryPhoto } from '../photo-library-types';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import { describePhotoDatePath } from '@/lib/photos/date-hierarchy';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { toGalleryInputs } from './photo-grid-format';
import {
  buildFolderTileOpenHandler,
  monthRangeOf,
  resolveFolderBrowseState,
  type FolderTileData,
  weekRangeOf,
} from './date-folder-tree';
import type { PhotoDateNav } from './types';

interface UseDateFoldersArgs {
  photos: LibraryPhoto[];
  scope: PhotoLibrarySourceScope;
  dateFrom?: string;
  dateTo?: string;
  poRef?: string;
  ticketId?: string;
  onNavigate: (nav: PhotoDateNav) => void;
  /**
   * First page for the current filter has settled. Empty-day widen must wait for
   * this — treating a still-loading query as empty causes day→week→month URL thrash
   * and skeleton remount flicker.
   */
  isSettled?: boolean;
}

interface DateFoldersState {
  isLeaf: boolean;
  leafPhotos: LibraryPhoto[];
  leafInputs: PhotoGalleryInput[];
  openIndex: number | null;
  setOpenIndex: Dispatch<SetStateAction<number | null>>;
  tiles: FolderTileData[];
  onOpen: (tile: FolderTileData) => void;
}

/**
 * Whether an empty date pin should widen (day→week / week→month).
 * Only after the query has settled with zero photos — never while pending.
 */
export function shouldWidenEmptyDateFolder({
  isSettled,
  poRef,
  ticketId,
  anchor,
  photoCount,
  level,
}: {
  isSettled: boolean;
  poRef?: string;
  ticketId?: string;
  anchor?: string;
  photoCount: number;
  level: string;
}): 'week' | 'month' | null {
  if (!isSettled || poRef || ticketId || !anchor || photoCount > 0) return null;
  if (level === 'day') return 'week';
  if (level === 'week') return 'month';
  return null;
}

/**
 * Date-drill folders view, driven by the active URL date filter (single source
 * of truth — the same state the bottom breadcrumb reads). Drill level + tiles
 * come from {@link resolveFolderBrowseState} (leaf contact sheet / widen only —
 * non-leaf tiles come from the folders aggregation API).
 */
export function useDateFolders({
  photos,
  scope,
  dateFrom,
  dateTo,
  poRef,
  ticketId,
  onNavigate,
  isSettled = true,
}: UseDateFoldersArgs): DateFoldersState {
  const browseArgs = useMemo(
    () => ({ photos, scope, dateFrom, dateTo, poRef, ticketId }),
    [photos, scope, dateFrom, dateTo, poRef, ticketId],
  );
  const browse = useMemo(() => resolveFolderBrowseState(browseArgs), [browseArgs]);
  const onOpen = useMemo(
    () => buildFolderTileOpenHandler(browseArgs, onNavigate),
    [browseArgs, onNavigate],
  );

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const leafPhotos = browse.leafPhotos;
  const leafInputs = useMemo(() => toGalleryInputs(leafPhotos, scope), [leafPhotos, scope]);

  const datePath = useMemo(() => describePhotoDatePath({ dateFrom, dateTo }), [dateFrom, dateTo]);
  const level = datePath.length === 0 ? 'root' : datePath[datePath.length - 1]!.key;
  const anchor = dateFrom;

  useEffect(() => setOpenIndex(null), [dateFrom, dateTo, poRef, ticketId]);

  // Empty-day fallback: only after the query settles empty — never while loading.
  useEffect(() => {
    const widen = shouldWidenEmptyDateFolder({
      isSettled,
      poRef,
      ticketId,
      anchor,
      photoCount: photos.length,
      level,
    });
    if (widen === 'week' && anchor) onNavigate(weekRangeOf(anchor));
    else if (widen === 'month' && anchor) onNavigate(monthRangeOf(anchor.slice(0, 7)));
  }, [level, poRef, ticketId, anchor, photos.length, onNavigate, isSettled]);

  return {
    isLeaf: browse.isLeaf,
    leafPhotos,
    leafInputs,
    openIndex,
    setOpenIndex,
    tiles: browse.tiles,
    onOpen,
  };
}
