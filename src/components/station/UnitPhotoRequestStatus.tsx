'use client';

import { useScopedUnitPhotos } from '@/hooks/useScopedUnitPhotos';
import { useUnitPhotosRealtimeRefresh } from '@/hooks/useUnitPhotosRealtimeRefresh';
import { useAuth } from '@/contexts/AuthContext';

/** Compact station-card status line: */
export function UnitPhotoRequestStatus({
  serialUnitId,
  unitKey,
}: {
  serialUnitId: number;
  unitKey: string | null;
}) {
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const { photos, query } = useScopedUnitPhotos(serialUnitId);
  useUnitPhotosRealtimeRefresh(serialUnitId, staffId, () => void query.refetch());
  const count = photos.length;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border-hairline bg-surface-card px-2.5 py-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
      <p className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-muted">
        Photo request sent → phone
        {unitKey ? <span className="text-text-faint"> · {unitKey}</span> : null}
      </p>
      <span className="shrink-0 text-role-micro tabular-nums text-text-faint">
        {count} captured
      </span>
    </div>
  );
}
