'use client';

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { LibraryPhoto } from '@/components/photos/photo-library-types';
import {
  entityTypeForSourceScope,
  PHOTO_LIBRARY_PAGE_SIZE,
  photoLibraryFiltersToParams,
  receivingSourceExcludeForScope,
  receivingSourceForScope,
  type PhotoLibraryFilterState,
} from '@/lib/photos/library-filter-state';

/** Map UI filter state → `/api/photos/library` query params. */
export function photoLibraryFilterParams(filters: PhotoLibraryFilterState): URLSearchParams {
  const params = photoLibraryFiltersToParams(filters);

  if (filters.sourceScope === 'outbound') {
    params.set('sourceScope', 'outbound');
    params.delete('entityType');
    params.delete('receivingSource');
    params.delete('receivingSourceExclude');
    params.delete('photoType');
    params.delete('imageType');
    if (filters.outboundMedia === 'pack_photos') {
      params.set('outboundMedia', 'pack_photos');
      params.set('entityType', 'PACKER_LOG');
      params.delete('documentType');
    } else {
      params.delete('outboundMedia');
      if (filters.documentType && filters.documentType !== 'all') {
        params.set('documentType', filters.documentType);
      } else {
        params.delete('documentType');
      }
    }
    return params;
  }

  params.delete('sourceScope');
  params.delete('documentType');
  params.delete('outboundMedia');

  const entityType = filters.sourceScope ? entityTypeForSourceScope(filters.sourceScope) : undefined;
  if (entityType) params.set('entityType', entityType);
  else params.delete('entityType');

  if (filters.sourceScope) {
    const includeSource = receivingSourceForScope(filters.sourceScope);
    if (includeSource) params.set('receivingSource', includeSource);
    else params.delete('receivingSource');
    const excludeSource = receivingSourceExcludeForScope(filters.sourceScope);
    if (excludeSource) params.set('receivingSourceExclude', excludeSource);
    else params.delete('receivingSourceExclude');
  } else {
    params.delete('receivingSource');
    params.delete('receivingSourceExclude');
  }

  if (filters.imageType) {
    params.delete('imageType');
    params.set('photoType', filters.imageType);
  } else {
    params.delete('photoType');
  }

  return params;
}

function buildQueryString(
  filters: PhotoLibraryFilterState,
  cursor: number | null | undefined,
  pageSize: number,
): string {
  const params = photoLibraryFilterParams(filters);
  params.set('limit', String(pageSize));
  if (cursor) params.set('cursor', String(cursor));
  return params.toString();
}

export function usePhotoLibrary(
  filters: PhotoLibraryFilterState,
  opts: { pageSize?: number; enabled?: boolean } = {},
) {
  const pageSize = opts.pageSize ?? PHOTO_LIBRARY_PAGE_SIZE;
  const enabled = opts.enabled ?? true;
  const queryKey = useMemo(
    () => ['photo-library', filters, pageSize] as const,
    [filters, pageSize],
  );

  const query = useInfiniteQuery({
    queryKey,
    enabled,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }) => {
      const qs = buildQueryString(filters, pageParam, pageSize);
      const res = await fetch(`/api/photos/library?${qs}`);
      if (!res.ok) throw new Error('Failed to load photos');
      return res.json() as Promise<{
        photos: LibraryPhoto[];
        nextCursor: number | null;
        hasMore: boolean;
      }>;
    },
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    // Keep prior folders visible while the next filter settles — avoids skeleton
    // remount flicker on Today / Latest-day / type switches.
    placeholderData: keepPreviousData,
  });

  const photos = useMemo(
    () => query.data?.pages.flatMap((p) => p.photos) ?? [],
    [query.data],
  );

  // Settled = real data for this filter key (not a keepPreviousData placeholder).
  // Empty-day widen and empty-state must wait for this to avoid URL thrash flicker.
  const isSettled = !query.isPending && !query.isPlaceholderData;

  return { query, photos, isSettled, pageSize };
}
