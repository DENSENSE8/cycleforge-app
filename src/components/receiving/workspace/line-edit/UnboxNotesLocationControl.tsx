'use client';

/** @domain-job Unbox notes-footer putaway — current location, scan on phone (`L`), recent-location shortcut, scanner arm and location management. */

import { useCallback, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, MapPin, Smartphone } from '@/components/Icons';
import { LocationCrudDialog } from '@/components/locations/LocationCrudDialog';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { StationLocationPill } from '@/components/station/location';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { useAuth } from '@/contexts/AuthContext';
import type { SlicedActionMenuItem } from '@/design-system/primitives';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { classifyArrivalCartonScan } from '@/lib/receiving/arrival-carton-scan';
import {
  formatStagedLocationFace,
  locationControlMenuState,
  recentStagedLocationQueryKey,
  stagedLocationButtonLabel,
} from '@/lib/receiving/recent-staged-location';
import { receivingSurfaceBasePath, UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import {
  UNBOX_LOCATION_HOTKEY,
  lineStagePatchFromRealtime,
  unboxLocationTarget,
} from '@/lib/receiving/unbox-location-handoff';
import { useCartonArrivalPlacement } from './useCartonArrivalPlacement';
import { useLocationScanOnPhone } from './useLocationScanOnPhone';
import { useUnboxLinePlacement } from './useUnboxLinePlacement';

export function UnboxNotesLocationControl({
  lineId,
  receivingId,
  currentLocationName,
  currentLocationBarcode,
  currentLocationRoom,
}: {
  lineId: number | null | undefined;
  /** The open LPN — placed itself on Unbox when there is no real line (unfound). */
  receivingId?: number | null;
  currentLocationName?: string | null;
  currentLocationBarcode?: string | null;
  currentLocationRoom?: string | null;
}) {
  const pathname = usePathname();
  const onUnbox = receivingSurfaceBasePath(pathname) === UNBOX_SURFACE_ROUTE;
  const target = unboxLocationTarget({ lineId, receivingId, cartonFallback: onUnbox });
  const targetLineId = target?.kind === 'line' ? target.lineId : null;

  const linePlacement = useUnboxLinePlacement(targetLineId);
  const carton = useCartonArrivalPlacement(target?.kind === 'carton' ? target.receivingId : null);
  const busy = target?.kind === 'carton' ? carton.busy : linePlacement.busy;
  const phone = useLocationScanOnPhone(onUnbox ? target : null, onUnbox);
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const recentQuery = useQuery({
    queryKey: recentStagedLocationQueryKey(targetLineId),
    queryFn: async () => {
      const qs =
        targetLineId != null
          ? `?excludeLineId=${encodeURIComponent(String(targetLineId))}`
          : '';
      const res = await fetch(`/api/receiving/recent-staged-location${qs}`);
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        locationId?: number | null;
        label?: string | null;
        barcode?: string | null;
      } | null;
      if (!res.ok || !data?.success) return { locationId: null, label: null, barcode: null };
      return {
        locationId: data.locationId ?? null,
        label: data.label ?? null,
        barcode: data.barcode ?? null,
      };
    },
    enabled: target != null,
  });

  // The phone (or another desk) placed this line: its row is local workspace
  // state, so repaint it from the stage broadcast rather than a refetch.
  const { user } = useAuth();
  const stationChannel = safeChannelName(() => getStationChannelName(user!.organizationId!));
  useAblyChannel(
    stationChannel,
    'receiving-log.changed',
    (msg: { data?: unknown }) => {
      if (targetLineId == null) return;
      const patch = lineStagePatchFromRealtime(msg?.data, targetLineId);
      if (patch) dispatchLineUpdated(patch);
    },
    !!stationChannel && targetLineId != null,
  );

  // An unfound LPN's location is the LPN's own (arrival read), not a line's.
  const current =
    target?.kind === 'carton'
      ? { name: carton.location?.name, barcode: carton.location?.code }
      : { name: currentLocationName, barcode: currentLocationBarcode, room: currentLocationRoom };
  const face = stagedLocationButtonLabel(current);
  /**
   * The location being left, or null when there is none. `face` falls back to
   * the empty-state invitation, which must never be reported as an origin.
   */
  const fromFace = formatStagedLocationFace(current) || null;

  const menuState = locationControlMenuState({
    lastLabel: recentQuery.data?.label ?? null,
    lastLocationId: recentQuery.data?.locationId ?? null,
  });

  const { applyStage } = linePlacement;
  const placeCarton = carton.place;

  const applyLast = useCallback(() => {
    const last = recentQuery.data;
    if (!last?.locationId) return;
    if (target?.kind === 'carton') {
      const label = last.barcode || last.label;
      if (label) void placeCarton(label);
      return;
    }
    void applyStage({ location_id: last.locationId }, last.label ?? undefined, fromFace);
  }, [applyStage, placeCarton, recentQuery.data, fromFace, target?.kind]);

  const applyScan = useCallback(
    (rawInput: string) => {
      const scan = classifyArrivalCartonScan(rawInput);
      if (!scan.raw) return;
      if (scan.kind === 'location') {
        if (target?.kind === 'carton') void placeCarton(scan.locationBarcode);
        else void applyStage({ barcode: scan.locationBarcode }, undefined, fromFace);
        return;
      }
      // Not a shelf — hand it back to tracking ingest unchanged, so a wedge
      // pull at the wrong moment never silently disappears.
      emitReceiving('receiving-submit-tracking', { tracking: scan.raw });
    },
    [applyStage, placeCarton, fromFace, target?.kind],
  );

  const sendToPhone = phone.send;
  const menu = useMemo<SlicedActionMenuItem[]>(
    () => [
      ...(onUnbox
        ? [
            {
              label: 'Scan on phone',
              title: 'Open the location scanner on your phone for this LPN (L)',
              icon: <Smartphone className="h-3.5 w-3.5 shrink-0" />,
              disabled: phone.pending,
              onClick: sendToPhone,
            },
          ]
        : []),
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
    [applyLast, busy, menuState, onUnbox, phone.pending, sendToPhone],
  );

  return (
    <div data-unbox-notes-location>
      {/* Admin CRUD, preselected to this line's location. On close the receiving
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
        initialBarcode={current.barcode}
      />
      <StationLocationPill
        face={face}
        tooltip={target ? face : 'Open a carton line to place it'}
        menu={menu}
        menuLabel="Location options"
        onScan={applyScan}
        sinkId={`unbox-notes-location:${lineId ?? 0}`}
        disabled={target == null}
        busy={busy}
        hotkey={onUnbox && target ? UNBOX_LOCATION_HOTKEY.toUpperCase() : undefined}
        hotkeyCap={phone.keyAwake}
        testId="unbox-notes-location-pill"
      />
    </div>
  );
}
