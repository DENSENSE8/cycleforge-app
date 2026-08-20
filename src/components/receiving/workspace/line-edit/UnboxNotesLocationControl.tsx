'use client';

/**
 * @domain-job Unbox notes-footer putaway — the open line's bin face, a
 *   location-QR scan arm, and the Last entry · Move · New · Edit menu.
 * @hardware-target Station
 * @density floor
 * @justification Writes `receiving_line_putaway` on the OPEN LINE and must sit
 *   left of Print in the notes composer. (It could never reuse Arrival's dock
 *   scan cell, which wrote the carton's triage `staging_location_id` — a
 *   different column on a different entity. That cell was deleted 2026-08-20
 *   when the Arrival floor became a single note field; the grain split it
 *   illustrates is why this control stays separate.)
 *
 * Chrome is {@link StationLocationPill} (the shared composer pill), not a
 * Button beside an IconButton: Print already owns the accent split pill in this
 * same footer, and a second control that looked nothing like it read as a
 * different KIND of thing. Location takes the quiet `surface` tone so Print
 * stays the one loud commit.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, MapPin, Pencil, Plus } from '@/components/Icons';
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
  onOpenLocations,
}: {
  lineId: number | null | undefined;
  currentLocationId?: number | null;
  currentLocationName?: string | null;
  currentLocationBarcode?: string | null;
  currentLocationRoom?: string | null;
  /**
   * Open Unbox Displays → Locations (list · print · mint). Absent → the menu
   * says so rather than painting a verb that goes nowhere.
   */
  onOpenLocations?: () => void;
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
    staleTime: 15_000,
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
        label: 'Move',
        title: menuState.moveTitle,
        icon: <MapPin className="h-3.5 w-3.5 shrink-0" />,
        disabled: !menuState.hasLast || busy,
        onClick: applyLast,
      },
      {
        label: 'New location',
        title: onOpenLocations
          ? 'Browse, reprint, or mint a shelf on Displays'
          : 'Locations are not available on this surface',
        icon: <Plus className="h-3.5 w-3.5 shrink-0" />,
        disabled: !onOpenLocations,
        separatorBefore: true,
        onClick: () => onOpenLocations?.(),
      },
      {
        // The admin half of the job — rename / re-key / retire a bin. It is a
        // DIALOG, not a Displays leaf, because editing is not a beat of the
        // carton's procedure: it interrupts, commits, and hands the bench back.
        label: 'Edit location…',
        title: 'Rename, re-key, retire, or reprint a bin',
        icon: <Pencil className="h-3.5 w-3.5 shrink-0" />,
        onClick: () => setEditOpen(true),
      },
    ],
    [applyLast, busy, menuState, onOpenLocations],
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
