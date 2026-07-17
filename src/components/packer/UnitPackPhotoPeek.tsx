'use client';

import { memo, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PhotoPeekFan, type PeekCard } from '@/components/receiving/workspace/line-edit/PhotoPeekFan';
import { useUnitPhotosRealtimeRefresh } from '@/hooks/useUnitPhotosRealtimeRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { photoContentUrl } from '@/lib/photos/display-url';
import { Camera } from '@/components/Icons';

interface TimelinePhotoRow {
  photoId: number;
  at: string | null;
  source: 'testing' | 'unbox' | 'packing';
  thumbUrl: string;
  fullUrl: string;
}

/**
 * Pack / unbox workspace peek for a SERIAL_UNIT's photos — prefers packing
 * bucket, falls back to all timeline photos so prepack packs still show
 * testing/unbox context.
 */
export const UnitPackPhotoPeek = memo(function UnitPackPhotoPeek({
  serialUnitId,
  preferSource = 'packing',
  showEmptyState = true,
}: {
  serialUnitId: number;
  preferSource?: 'packing' | 'testing' | 'unbox' | 'all';
  /** Inline photo tabs teach when empty; pane-corner overlays stay absent. */
  showEmptyState?: boolean;
}) {
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['unit-timeline-photos-peek', serialUnitId],
    queryFn: async (): Promise<TimelinePhotoRow[]> => {
      const res = await fetch(`/api/serial-units/${serialUnitId}/timeline-photos`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      return Array.isArray(body?.photos) ? body.photos : [];
    },
    enabled: Number.isFinite(serialUnitId) && serialUnitId > 0,
    staleTime: 10_000,
  });

  useUnitPhotosRealtimeRefresh(serialUnitId, staffId, () => {
    void queryClient.invalidateQueries({ queryKey: ['unit-timeline-photos-peek', serialUnitId] });
    void query.refetch();
  });

  const cards = useMemo<PeekCard[]>(() => {
    const photos = query.data ?? [];
    const filtered =
      preferSource === 'all'
        ? photos
        : photos.filter((p) => p.source === preferSource).length > 0
          ? photos.filter((p) => p.source === preferSource)
          : photos;
    return filtered.map((p) => ({
      id: String(p.photoId),
      imgUrl: p.thumbUrl || photoContentUrl(p.photoId, 'thumb'),
      alt: `${p.source} photo`,
    }));
  }, [query.data, preferSource]);

  if (cards.length === 0) {
    if (!showEmptyState) return null;
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border-soft bg-surface-canvas px-3 py-4 text-role-caption text-text-faint">
        <Camera className="h-4 w-4 shrink-0" />
        <span>No packed photos yet — scan the unit QR to open the phone camera.</span>
      </div>
    );
  }

  return <PhotoPeekFan cards={cards} />;
});

export default UnitPackPhotoPeek;
