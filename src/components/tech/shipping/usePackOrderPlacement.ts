'use client';

/** Ready-to-Pack placement — the open order's packing desk. */

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';
import { packPlacementQuery } from '@/lib/queries/pack-placement-queries';
import { toast } from '@/lib/toast';

interface MoveResponse {
  success?: boolean;
  error?: string;
  placement?: { locationId: number; locationName: string };
}

export function usePackOrderPlacement({
  orderId,
  initialLocationId,
  initialLocationName,
}: {
  orderId: number | null;
  initialLocationId?: number | null;
  initialLocationName?: string | null;
}) {
  const queryClient = useQueryClient();
  const enabled = orderId != null && Number.isFinite(orderId) && orderId > 0;

  const [locationId, setLocationId] = useState<number | null>(initialLocationId ?? null);
  const [locationName, setLocationName] = useState<string | null>(
    initialLocationName ?? null,
  );
  const [busy, setBusy] = useState(false);

  // A new order in the same mount is a new placement — without this the pill
  // keeps the previous order's bench on screen.
  useEffect(() => {
    setLocationId(initialLocationId ?? null);
    setLocationName(initialLocationName ?? null);
  }, [orderId, initialLocationId, initialLocationName]);

  const placementQuery = useQuery({
    ...packPlacementQuery({ excludeOrderId: enabled ? orderId : null }),
    enabled,
  });

  const counts = placementQuery.data?.counts ?? [];
  const recent = placementQuery.data?.recent ?? null;

  const benches = counts.map((row) => ({
    locationId: row.locationId,
    label: packBenchShortLabel(row),
    count: row.count,
  }));

  /** Returns whether the move LANDED — callers must not toast a rollback. */
  const moveTo = useCallback(
    async (body: { locationId?: number; barcode?: string }): Promise<boolean> => {
      if (!enabled || busy) return false;
      if (body.locationId != null && body.locationId === locationId) {
        toast.message('Already at that station');
        return false;
      }
      setBusy(true);
      try {
        const res = await fetch('/api/orders/pack-placement/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, ...body }),
        });
        const data = (await res.json().catch(() => null)) as MoveResponse | null;
        if (!res.ok || !data?.success || !data.placement) {
          toast.error(data?.error || 'Move failed');
          return false;
        }
        setLocationId(data.placement.locationId);
        setLocationName(data.placement.locationName);
        void queryClient.invalidateQueries({ queryKey: ['orders', 'pack-placement'] });
        void queryClient.invalidateQueries({ queryKey: ['orders', 'queue-counts'] });
        toast.success(`Station → ${data.placement.locationName}`);
        return true;
      } catch {
        toast.error('Move failed');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, enabled, locationId, orderId, queryClient],
  );

  return {
    enabled,
    busy,
    locationId,
    locationName,
    benches,
    recent,
    locationsLoading: placementQuery.isLoading,
    locations: placementQuery.data?.locations ?? [],
    moveTo,
    refreshCatalog: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders', 'pack-placement'] });
    },
  };
}

export type PackOrderPlacement = ReturnType<typeof usePackOrderPlacement>;
