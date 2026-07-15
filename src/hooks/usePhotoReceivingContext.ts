'use client';

import { useQuery } from '@tanstack/react-query';

export interface PhotoReceivingContextData {
  cartonId: number | null;
  /** Raw claim ref, e.g. "#9518". */
  claim: string | null;
  tracking: string | null;
  serials: string[];
}

/**
 * Lazily fetch a photo's receiving provenance (serial(s) / tracking / claim) for
 * the fullscreen viewer's context panel. Disabled until a real photo id is
 * present, so the grid never fires it; cached generously since this data is
 * effectively immutable for a given photo.
 */
export function usePhotoReceivingContext(photoId: number | null | undefined) {
  return useQuery<PhotoReceivingContextData>({
    queryKey: ['photo-receiving-context', photoId],
    enabled: typeof photoId === 'number' && Number.isFinite(photoId) && photoId > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/photos/${photoId}/context`);
      if (!res.ok) throw new Error('Failed to load photo context');
      return res.json() as Promise<PhotoReceivingContextData>;
    },
  });
}
