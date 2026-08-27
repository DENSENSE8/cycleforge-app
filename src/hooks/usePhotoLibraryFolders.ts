'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { photoLibraryFilterParams } from '@/hooks/usePhotoLibrary';
import type { PhotoLibraryFilterState } from '@/lib/photos/library-filter-state';
import {
  resolvePhotoLibraryFolderLevel,
  type PhotoLibraryFolderLevel,
} from '@/lib/photos/folder-level';
import type { PhotoLibraryFolderTile } from '@/lib/photos/queries/library';

export type LibraryFolderTile = PhotoLibraryFolderTile & {
  previewThumbUrl?: string | null;
};

/**
 * Cheap folder tiles for Media Library non-leaf browse.
 * Does not fetch photo rows — only aggregation counts from /library/folders.
 */
export function usePhotoLibraryFolders(
  filters: PhotoLibraryFilterState,
  opts: { enabled?: boolean } = {},
) {
  const resolved = useMemo(
    () =>
      resolvePhotoLibraryFolderLevel({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        poRef: filters.poRef,
        ticketId: filters.ticketId,
        receivingId: filters.receivingId,
      }),
    [filters.dateFrom, filters.dateTo, filters.poRef, filters.ticketId, filters.receivingId],
  );

  const enabled = (opts.enabled ?? true) && !resolved.isLeaf;

  const query = useQuery({
    queryKey: ['photo-library-folders', filters, resolved.level],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ tiles: LibraryFolderTile[]; level: PhotoLibraryFolderLevel }> => {
      const params = photoLibraryFilterParams(filters);
      params.set('level', resolved.level);
      const res = await fetch(`/api/photos/library/folders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load folders');
      return res.json();
    },
  });

  const tiles = query.data?.tiles ?? [];
  const isSettled = !query.isPending && !query.isPlaceholderData;

  return {
    ...resolved,
    tiles,
    query,
    isSettled,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
  };
}
