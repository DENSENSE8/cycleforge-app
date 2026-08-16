'use client';

/**
 * useTriageStaging — shelf + lane assignment for triage (locations catalog).
 * Shelf save auto-routes lane via `resolveTriageLane`; operator can override
 * lane manually (manual wins — see triage-lane-policy).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { resolveTriageLane } from '@/lib/receiving/triage-lane-policy';
import { qk } from '@/queries/keys';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { Location } from '@/lib/neon/location-queries';

interface LocationsResponse {
  locations: Location[];
}

export function useTriageStaging(row: ReceivingLineRow) {
  const queryClient = useQueryClient();

  const locationsQuery = useQuery<Location[]>({
    queryKey: ['locations', 'active'] as const,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch('/api/locations', { cache: 'no-store' });
      if (!res.ok) return [];
      const data = (await res.json()) as LocationsResponse;
      // Real bins only — a room/zone parent (no row/col) isn't a scannable shelf.
      return (data.locations ?? []).filter((l) => l.row_label != null && l.col_label != null);
    },
  });
  const locations = locationsQuery.data ?? [];

  const [stagingLocationId, setStagingLocationId] = useState(row.staging_location_id ?? null);
  useEffect(() => {
    setStagingLocationId(row.staging_location_id ?? null);
  }, [row.id, row.staging_location_id]);

  const [priorityLane, setPriorityLane] = useState(row.priority_lane ?? null);
  useEffect(() => {
    setPriorityLane(row.priority_lane ?? null);
  }, [row.id, row.priority_lane]);

  const [savingLocation, setSavingLocation] = useState(false);
  const [savingLane, setSavingLane] = useState(false);

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === stagingLocationId) ?? null,
    [locations, stagingLocationId],
  );

  const locationLabel = useMemo(() => {
    if (!selectedLocation) return null;
    return selectedLocation.room
      ? `${selectedLocation.room} · ${selectedLocation.name}`
      : selectedLocation.name;
  }, [selectedLocation]);

  const isStaged = stagingLocationId != null && !!priorityLane;

  const patchStaging = useCallback(
    async (patch: { staging_location_id?: number | null; priority_lane?: string | null }) => {
      if (row.receiving_id == null) return false;
      try {
        const res = await fetch(`/api/receiving/${row.receiving_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          toast.error(data?.error || 'Could not save staging');
          return false;
        }
        dispatchLineUpdated({ id: row.id, ...patch });
        invalidateReceivingFeeds(queryClient);
        return true;
      } catch {
        toast.error('Could not save staging');
        return false;
      }
    },
    [row.receiving_id, row.id, queryClient],
  );

  /**
   * Assign the shelf (and auto-route the lane). Returns whether the write
   * landed so a scan-driven caller can name the shelf in a success toast
   * without claiming a placement that rolled back.
   */
  const selectShelf = useCallback(
    async (locationId: number | null): Promise<boolean> => {
      setStagingLocationId(locationId);
      setSavingLocation(true);
      const autoLane = resolveTriageLane(priorityLane, {
        isReturn: isReturnIntake(row),
        isPriority: !!row.is_priority,
      });
      if (autoLane) setPriorityLane(autoLane);
      const ok = await patchStaging({
        staging_location_id: locationId,
        ...(autoLane ? { priority_lane: autoLane } : {}),
      });
      if (!ok) {
        setStagingLocationId(row.staging_location_id ?? null);
        setPriorityLane(row.priority_lane ?? null);
      }
      setSavingLocation(false);
      return ok;
    },
    [patchStaging, row, priorityLane],
  );

  /**
   * Re-read the locations catalog after something MINTED a shelf (the dock
   * scanned a barcode this list had never seen; the New location leaf just
   * registered one).
   *
   * Without it the write lands and the UI denies it: `staging_location_id` is
   * set, but the `<select>` and the shelf summary both resolve their label from
   * this 60s-stale list, so the operator sees "Select a shelf…" next to a
   * STAGED chip — which reads as "nothing happened" at a bench.
   *
   * `qk.locations.all` is `['locations']`, a PREFIX of this hook's own
   * `['locations','active']` and of the room picker's `qk.locations.list()`, so
   * one invalidation refreshes both.
   */
  const refreshCatalog = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.locations.all });
  }, [queryClient]);

  const selectLane = useCallback(
    async (lane: string | null) => {
      setPriorityLane(lane);
      setSavingLane(true);
      const ok = await patchStaging({ priority_lane: lane });
      if (!ok) setPriorityLane(row.priority_lane ?? null);
      setSavingLane(false);
    },
    [patchStaging, row.priority_lane],
  );

  return {
    locations,
    locationsLoading: locationsQuery.isLoading,
    stagingLocationId,
    selectShelf,
    refreshCatalog,
    savingLocation,
    priorityLane,
    selectLane,
    savingLane,
    selectedLocation,
    locationLabel,
    isStaged,
  };
}

export type TriageStagingController = ReturnType<typeof useTriageStaging>;
