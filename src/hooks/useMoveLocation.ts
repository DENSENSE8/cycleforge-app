'use client';

import { useCallback, useState } from 'react';
import type { StationLocationRow } from '@/components/station/location/station-location-port';
import { useRegisterScanSink } from '@/lib/station-scan-sink';

/** Resolve only an exact scannable location barcode; labels are display-only. */
export function resolveLocationScan(
  raw: string,
  locations: readonly StationLocationRow[],
): StationLocationRow | null {
  const scanned = String(raw ?? '').trim().toLocaleUpperCase();
  if (!scanned) return null;
  return (
    locations.find((location) => location.barcode?.trim().toLocaleUpperCase() === scanned) ?? null
  );
}

export interface MoveLocationOptions<TTarget> {
  /** The receiving line, order, unit, or other entity being moved. */
  target: TTarget | null;
  /** The catalog of exact scannable locations available to this target. */
  locations: readonly StationLocationRow[];
  /** Unique scan sink for this mounted target. */
  sinkId: string;
  /** Disable registration while the target is unavailable or read-only. */
  enabled?: boolean;
  /** Existing domain writer. The hook never selects a storage table. */
  place: (target: TTarget, locationId: number) => Promise<boolean>;
  /** Called only after the domain writer confirms that the move landed. */
  onPlaced?: (target: TTarget, location: StationLocationRow) => void;
}

/**
 * Shared scan-to-location movement hook.
 *
 * The scan grammar and lifecycle are global; persistence remains polymorphic in
 * the supplied `place` function. This is the one hook for receiving lines,
 * packing orders, inventory units, and future movable entities.
 */
export function useMoveLocation<TTarget>({
  target,
  locations,
  sinkId,
  enabled = true,
  place,
  onPlaced,
}: MoveLocationOptions<TTarget>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moveToLocation = useCallback(
    async (raw: string) => {
      if (!target || busy) return false;
      const location = resolveLocationScan(raw, locations);
      if (!location) {
        setError('Location barcode not recognized');
        return false;
      }

      setError(null);
      setBusy(true);
      try {
        const landed = await place(target, location.id);
        if (landed) onPlaced?.(target, location);
        else setError('Location move did not complete');
        return landed;
      } catch {
        setError('Location move failed');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, locations, onPlaced, place, target],
  );

  useRegisterScanSink({
    id: sinkId,
    enabled: enabled && target != null && !busy,
    onScan: (raw) => {
      void moveToLocation(raw);
    },
  });

  return {
    busy,
    error,
    moveToLocation,
  };
}
