'use client';

/** @domain-job Unbox notes-footer putaway — current bin, recent-bin shortcut, scanner arm and location management. */

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, MapPin } from '@/components/Icons';
import { LocationCrudDialog } from '@/components/locations/LocationCrudDialog';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { StationLocationPill } from '@/components/station/location';
import type { SlicedActionMenuItem } from '@/design-system/primitives';
import { classifyArrivalCartonScan } from '@/lib/receiving/arrival-carton-scan';
import {
  formatStagedLocationFace,
  locationControlMenuState,
  recentStagedLocationQueryKey,
  stagedLocationButtonLabel,
} from '@/lib/receiving/recent-staged-location';
import { useUnboxLinePlacement } from './useUnboxLinePlacement';

export function UnboxNotesLocationControl({
  lineId,
  currentLocationName,
  currentLocationBarcode,
  currentLocationRoom,
}: {
  lineId: number | null | undefined;
  currentLocationName?: string | null;
  currentLocationBarcode?: string | null;
  currentLocationRoom?: string | null;
}) {
  const { enabled, busy, applyStage } = useUnboxLinePlacement(lineId);
  const excludeLineId = enabled ? lineId! : null;
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const recentQuery = useQuery({
    queryKey: recentStagedLocationQueryKey(excludeLineId),
    queryFn: async () => {
      const qs =
        excludeLineId != null
          ? `?excludeLineId=${encodeURIComponent(String(excludeLineId))}`
          : '';
      const res = await fetch(`/api/receiving/recent-staged-location${qs}`);
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        locationId?: number | null;
        label?: string | null;
      } | null;
      if (!res.ok || !data?.success) return { locationId: null, label: null };
      return {
        locationId: data.locationId ?? null,
        label: data.label ?? null,
      };
    },
    enabled,
  });

  const face = stagedLocationButtonLabel({
    name: currentLocationName,
    barcode: currentLocationBarcode,
    room: currentLocationRoom,
  });

  const menuState = locationControlMenuState({
    lastLabel: recentQuery.data?.label ?? null,
    lastLocationId: recentQuery.data?.locationId ?? null,
  });

  /**
   * The bin being left, or null when the line has none. `face` falls back to
   * the empty-state invitation, which must never be reported as an origin.
   */
  const fromFace = formatStagedLocationFace({
    name: currentLocationName,
    barcode: currentLocationBarcode,
    room: currentLocationRoom,
  }) || null;

  const applyLast = useCallback(() => {
    const id = recentQuery.data?.locationId;
    if (!id) return;
    void applyStage(
      { location_id: id },
      recentQuery.data?.label ?? undefined,
      fromFace,
    );
  }, [applyStage, recentQuery.data, fromFace]);

  const applyScan = useCallback(
    (rawInput: string) => {
      const scan = classifyArrivalCartonScan(rawInput);
      if (!scan.raw) return;
      if (scan.kind === 'location') {
        void applyStage({ barcode: scan.locationBarcode }, undefined, fromFace);
        return;
      }
      // Not a shelf — hand it back to tracking ingest unchanged, so a wedge
      // pull at the wrong moment never silently disappears.
      emitReceiving('receiving-submit-tracking', { tracking: scan.raw });
    },
    [applyStage, fromFace],
  );

  const menu = useMemo<SlicedActionMenuItem[]>(
    () => [
      {
        label: menuState.lastEntryLabel,
        title: menuState.lastEntryTitle,
        icon: <History className="h-3.5 w-3.5 shrink-0" />,
        disabled: !menuState.hasLast || busy,
        onClick: applyLast,
      },
      {
        label: 'Locations…',
        title: 'Browse, create, reprint, or edit locations',
        icon: <MapPin className="h-3.5 w-3.5 shrink-0" />,
        separatorBefore: true,
        onClick: () => setEditOpen(true),
      },
    ],
    [applyLast, busy, menuState],
  );

  return (
    <div data-unbox-notes-location>
      {/* Admin CRUD, preselected to this line's bin. On close the receiving
          reads are invalidated: a rename here changes the face the pill paints
          from the row, which the dialog's own locations cache cannot refresh. */}
      <LocationCrudDialog
        open={editOpen}
        onOpenChange={(next) => {
          setEditOpen(next);
          if (!next) {
            void queryClient.invalidateQueries({ queryKey: ['receiving'] });
          }
        }}
        initialBarcode={currentLocationBarcode}
      />
      <StationLocationPill
        face={face}
        tooltip={enabled ? face : 'Open a carton line to place it'}
        menu={menu}
        menuLabel="Location options"
        onScan={applyScan}
        sinkId={`unbox-notes-location:${lineId ?? 0}`}
        disabled={!enabled}
        busy={busy}
        testId="unbox-notes-location-pill"
      />
    </div>
  );
}
