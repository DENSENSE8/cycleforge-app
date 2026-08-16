'use client';

/**
 * Current packing-station chip + move picker for the Ready-to-Pack active order.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { packPlacementQuery } from '@/lib/queries/pack-placement-queries';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';
import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens';

export function PackStationPlacementControl({
  orderId,
  initialLocationId,
  initialLocationName,
}: {
  orderId: number;
  initialLocationId?: number | null;
  initialLocationName?: string | null;
}) {
  const query = useQuery(packPlacementQuery());
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<number | null>(initialLocationId ?? null);
  const [locationName, setLocationName] = useState<string | null>(initialLocationName ?? null);

  const counts = query.data?.counts ?? [];

  const moveTo = async (toLocationId: number) => {
    if (!orderId || toLocationId === locationId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/orders/pack-placement/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, locationId: toLocationId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error || 'Move failed');
        return;
      }
      setLocationId(data.placement.locationId);
      setLocationName(data.placement.locationName);
      void queryClient.invalidateQueries({ queryKey: ['orders', 'pack-placement'] });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'queue-counts'] });
    } catch {
      setError('Move failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`flex flex-col gap-1 border-b border-border-soft bg-surface-card px-3 py-2 ${cornerClass('flush')}`}
      data-testid="pack-station-placement"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-role-micro font-semibold uppercase tracking-wide text-text-faint">
          Packing station
        </p>
        <p className="truncate text-role-caption font-semibold text-text-default">
          {locationName || 'Unplaced'}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {counts.map((row) => (
          <Button
            key={row.locationId}
            type="button"
            size="sm"
            variant={row.locationId === locationId ? 'primary' : 'secondary'}
            disabled={busy || row.locationId === locationId}
            onClick={() => void moveTo(row.locationId)}
          >
            {/* Label SoT — a hand-rolled strip here is how this button drifted
                from the bench chips showing the same benches elsewhere. */}
            {packBenchShortLabel(row)}
          </Button>
        ))}
      </div>
      {error ? (
        <p className="text-role-micro font-semibold text-text-danger">{error}</p>
      ) : null}
    </div>
  );
}
