'use client';

import { useScopedPackerPhotos } from '@/hooks/useScopedPackerPhotos';
import { usePackerPhotosRealtimeRefresh } from '@/hooks/usePackerPhotosRealtimeRefresh';

/**
 * Compact station-card status line for the ORDERS-pack photo bridge: after a
 * tracking pack opens the packer's phone (server `publishPackerScanReady`), this
 * shows "Photo request sent → phone" and a live captured count that bumps as the
 * phone's guided slip/box uploads land (`packer-photo.changed`). Packing mirror
 * of {@link UnitPhotoRequestStatus} — same house "status = small dot + text"
 * ambient chrome, not a toast. Plan §1c.
 */
export function PackerPhotoRequestStatus({
  packerLogId,
  orderId,
}: {
  packerLogId: number;
  orderId?: string | null;
}) {
  const { query } = useScopedPackerPhotos(packerLogId);
  usePackerPhotosRealtimeRefresh(packerLogId, () => void query.refetch());
  const count = query.data?.photos?.length ?? 0;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border-hairline bg-surface-card px-2.5 py-1.5">
      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
      <p className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-muted">
        Photo request sent → phone
        {orderId ? <span className="text-text-faint"> · {orderId}</span> : null}
      </p>
      <span className="shrink-0 text-role-micro font-bold tabular-nums text-text-faint">
        {count} captured
      </span>
    </div>
  );
}
