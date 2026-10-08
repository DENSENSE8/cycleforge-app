'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchReceivingPhotoList,
  RECEIVING_PHOTOS_STALE_MS,
  receivingPhotoListQueryKey,
} from '@/lib/queries/receiving-queries';
import { RECEIVING_PHOTO_LIST_INTENT_CARTON } from '@/lib/receiving/photo-intent';

/**
 * Whether the carton has any photo — the Photos tab's visibility rule. Reads
 * the header photo button's carton list (same query key, so no second
 * request on Unbox), seeded by the row's `photo_count` while it loads.
 */
export function useStationHasPhotos(receivingId: number | null | undefined, photoCountHint?: number | null): boolean {
  const id = receivingId != null && Number.isFinite(receivingId) && receivingId > 0 ? receivingId : null;
  const params = {
    receivingId: id ?? 0,
    photoIntent: RECEIVING_PHOTO_LIST_INTENT_CARTON,
    receivingLineId: null,
    photoAspect: null,
  };
  const { data } = useQuery<{ photos?: readonly unknown[] }>({
    queryKey: receivingPhotoListQueryKey(params),
    queryFn: () => fetchReceivingPhotoList(params),
    enabled: id != null,
    staleTime: RECEIVING_PHOTOS_STALE_MS,
  });
  if (data?.photos) return data.photos.length > 0;
  return (photoCountHint ?? 0) > 0;
}
