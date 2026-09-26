'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { receivingPhotosQueryKey } from '@/lib/queries/receiving-queries';
import { useReceivingPhotosRealtimeRefresh } from '@/hooks/useReceivingPhotosRealtimeRefresh';
import { useAuth } from '@/contexts/AuthContext';

/** One carton's photos, from `GET /api/receiving-photos`. */
export interface ReceivingPhotoRow {
  id: number;
  receivingId: number | null;
  receivingLineId: number | null;
  photoUrl: string;
  /**
   * Legacy alias carrying `photos.photo_type`. Prefer {@link photoType}; this
   * stays because the receive gate and three other readers still parse it.
   */
  caption: string | null;
  /** `photos.photo_type` — the stage half of stage × aspect. */
  photoType?: string | null;
  /** `photos.photo_aspect` — WHAT the shot shows. NULL = unclassified, not missing. */
  photoAspect?: string | null;
  createdAt?: string;
  /** Device shutter clock; null on desktop / legacy rows. */
  clientCapturedAt?: string | null;
  /** Carries a secondary `claim_evidence` link (a filed claim). */
  hasClaimEvidence?: boolean;
  /** Carries a secondary `insurance_share` link (carrier / share pack). */
  hasInsuranceShare?: boolean;
}

interface ReceivingPhotosPayload {
  photos: ReceivingPhotoRow[];
}

interface UseReceivingPhotosOptions {
  /**
   * Look-up / carton-read. Suppresses the background poll and the realtime
   * subscription — a read surface has no capture happening behind it.
   */
  readOnly?: boolean;
  enabled?: boolean;
}

interface UseReceivingPhotosResult {
  queryKey: ReturnType<typeof receivingPhotosQueryKey>;
  /** Rows with a usable URL, in server order. Empty while loading or on error. */
  photos: ReceivingPhotoRow[];
  isFetching: boolean;
  isError: boolean;
  /** True once a payload has arrived — so `photos.length === 0` means "none". */
  settled: boolean;
  invalidate: () => void;
}

export function useReceivingPhotos(
  receivingId: number | string | null | undefined,
  opts: UseReceivingPhotosOptions = {},
): UseReceivingPhotosResult {
  const { readOnly = false } = opts;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;

  const id = Number(receivingId);
  const valid = Number.isFinite(id) && id > 0;
  const enabled = (opts.enabled ?? true) && valid;
  const queryKey = receivingPhotosQueryKey(valid ? id : 0);

  const { data, isFetching, isError } = useQuery<ReceivingPhotosPayload>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/receiving-photos?receivingId=${id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load photos for receiving ${id}`);
      const json = await res.json().catch(() => null);
      // Normalize the two shapes a cached/legacy payload can take into the ONE
      // this key stores. A bare array here would break `data.photos` readers.
      if (Array.isArray(json)) return { photos: json as ReceivingPhotoRow[] };
      const photos = (json as ReceivingPhotosPayload | null)?.photos;
      return { photos: Array.isArray(photos) ? photos : [] };
    },
    enabled,
    // A read surface has no capture running behind it; the bench does.
    refetchInterval: readOnly ? false : 30_000,
    staleTime: 20_000,
  });

  useReceivingPhotosRealtimeRefresh(
    valid ? id : null,
    staffId,
    () => queryClient.invalidateQueries({ queryKey }),
    !readOnly && staffId > 0,
  );

  const photos = useMemo(
    () => (data?.photos ?? []).filter((p) => !!p.photoUrl?.trim()),
    [data?.photos],
  );

  return {
    queryKey,
    photos,
    isFetching,
    isError,
    settled: data != null,
    invalidate: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  };
}
