'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TimelineSection } from '@/components/ui/TimelineSection';
import { unitPhotosToTimeline } from '@/lib/timeline';
import { unitTimelinePhotosQuery } from '@/lib/timeline/journey-photos';
import { useAuth } from '@/contexts/AuthContext';
import { useUnitPhotosRealtimeRefresh } from '@/hooks/useUnitPhotosRealtimeRefresh';

/** The unit's PHOTO timeline — the five stage buckets (arrival / unbox carton / unbox item via serial_unit_provenance, testing, packing),… */
export function SerialUnitTimelineSection({ serialUnitId }: { serialUnitId: number }) {
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;

  // Shared cache identity with every journey photo consumer
  // (`unitTimelinePhotosQuery`), so co-mounted surfaces fetch once.
  const query = useQuery(unitTimelinePhotosQuery(serialUnitId));

  useUnitPhotosRealtimeRefresh(serialUnitId, staffId, () => void query.refetch());

  const items = useMemo(
    () => unitPhotosToTimeline(query.data?.photos ?? []),
    [query.data?.photos],
  );

  // Hide entirely when a settled unit has no paired photos — keeps the pane
  // uncluttered for units that never went through testing-photo capture.
  if (!query.isLoading && items.length === 0) return null;

  return (
    <TimelineSection
      title="Photos"
      items={items}
      loading={query.isLoading}
      emptyMessage="No unit photos yet."
      density="comfortable"
      className="border-t border-border-hairline pt-4"
    />
  );
}
