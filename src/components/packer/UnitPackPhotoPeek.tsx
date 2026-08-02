'use client';

import { memo, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PhotoPeekFan, type PeekCard } from '@/components/receiving/workspace/line-edit/PhotoPeekFan';
import { useUnitPhotosRealtimeRefresh } from '@/hooks/useUnitPhotosRealtimeRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { photoContentUrl } from '@/lib/photos/display-url';
import { unitTimelinePhotosKey, unitTimelinePhotosQuery } from '@/lib/timeline/journey-photos';
import type { UnitTimelinePhotoRowSource } from '@/lib/timeline/unit-photos-events';
import { Camera } from '@/components/Icons';

/**
 * Pack / testing workspace peek for a SERIAL_UNIT's photos — prefers one stage
 * bucket, falls back to all timeline photos so prepack packs still show
 * testing/inbound context. Shares the canonical unit-timeline-photos query
 * (one cache entry per unit with the journey/timeline surfaces).
 */
export const UnitPackPhotoPeek = memo(function UnitPackPhotoPeek({
  serialUnitId,
  preferSource = 'packing',
  showEmptyState = true,
}: {
  serialUnitId: number;
  preferSource?: UnitTimelinePhotoRowSource | 'all';
  /** Inline photo tabs teach when empty; pane-corner overlays stay absent. */
  showEmptyState?: boolean;
}) {
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const queryClient = useQueryClient();

  const query = useQuery(unitTimelinePhotosQuery(serialUnitId));

  useUnitPhotosRealtimeRefresh(serialUnitId, staffId, () => {
    void queryClient.invalidateQueries({ queryKey: unitTimelinePhotosKey(serialUnitId) });
  });

  const cards = useMemo<PeekCard[]>(() => {
    const photos = query.data?.photos ?? [];
    const preferred =
      preferSource === 'all' ? photos : photos.filter((p) => p.source === preferSource);
    const filtered = preferred.length > 0 ? preferred : photos;
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
