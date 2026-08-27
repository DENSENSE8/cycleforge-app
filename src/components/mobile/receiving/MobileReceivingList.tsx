'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import {
  safeChannelName,
  getPhoneBridgeChannelName,
  getStaffStationBridgeChannelName,
  getStationChannelName,
} from '@/lib/realtime/channels';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';
import { useNasConfig } from '@/hooks/useNasConfig';
import {
  INCOMING_EMPTY_HINT,
  INCOMING_EMPTY_TITLE,
} from '@/components/receiving/incoming/IncomingFirstPaint';
import {
  MobilePackageGroup,
  MobileReceivingUnitCard,
  type ReceivingCardCallbacks,
} from '@/components/mobile/receiving/MobileReceivingCards';
import {
  groupReceivingEntries,
  type ReceivingFeedEntry,
} from '@/components/mobile/receiving/receiving-feed-entries';
import { MobileArrivalDetailsSheet } from '@/components/mobile/receiving/MobileArrivalDetailsSheet';
import { MobileCartonSheet } from '@/components/mobile/receiving/MobileCartonSheet';
import { MobileReceivingFeedGallery } from '@/components/mobile/receiving/MobileReceivingFeedGallery';
import { CaptureStack, useCaptureStackWindow, useCaptureStackQuery } from '@/design-system/components/capture-stack';
import { receivingLinePhotoHrefs } from '@/lib/photos/mobile-gallery-url';
import { mobileArrivalPhotosThenClassifyHref } from '@/lib/receiving/arrival-mobile-flow';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  mobileFeedParams,
  mobileFeedQueryKey,
} from '@/lib/receiving/mobile-feed-query-key';

interface ApiResponse {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
}

// The feed's query key and list params are shared with the SERVER SEED that
// paints this list into the first HTML (`mobile-feed-seed.server.ts`) — they
// live in `@/lib/receiving/mobile-feed-query-key` because a seed only works
// while both sides agree on the key to the character.

/**
 * Mobile receiving surface — single scrollable list of receiving lines, newest
 * pinned at the bottom in an expanded card, older rows as compact pills. Tap a
 * row to open a sheet: Arrival triage opens editable Platform · Type · Priority;
 * Unbox opens MobileCartonSheet. The expanded card's camera CTA jumps to capture.
 *
 * `surface` selects which desktop rail this feed mirrors:
 *   • triage — door-scanned cartons awaiting unbox (package photos)
 *   • unbox  — cartons opened on the bench (item photos)
 */
export function MobileReceivingList({
  limit = 8,
  surface = 'unbox',
}: {
  limit?: number;
  surface?: 'triage' | 'unbox';
} = {}) {
  const { user } = useAuth();
  // No `enabled: isMobile` gate. It existed because `ReceivingSurfacePage` used
  // to mount this feed hidden on desktop behind `md:hidden`, and an invisible
  // mount must not pay the 100-row fetch. That mount is gone — this component
  // renders only on the `/m/*` tree now — and the gate had become the feed's
  // slowest link: `isMobile` resolves in a client effect, so the request could
  // not be issued until after hydration, on top of the bundle it already waits
  // for. The server seed below paints the first screen; this fetch reconciles.
  const orgId = user?.organizationId;
  const staffId = user?.staffId ?? 0;
  const stationBridgeChannel = safeChannelName(() => getStaffStationBridgeChannelName(orgId!, staffId));
  const phoneChannel = safeChannelName(() => getPhoneBridgeChannelName(orgId!, staffId));
  useRealtimeToasts('receiving');
  // Seed runtime NAS base (/api/nas) before capture routes or the carton sheet open.
  useNasConfig();

  const queryKey = mobileFeedQueryKey(surface);

  const { data, isLoading, refetch } = useCaptureStackQuery<ReceivingLineRow>({
    queryKey,
    // Capture navigates to a fullscreen (immersive) route and back, so the
    // realtime photo push fires while this list is unmounted (no rewind). Always
    // refetch on return so the camera ×N badge reconciles past the staleTime
    // window — the optimistic bump in notifyReceivingPhotoChanged covers the gap.
    //
    // Tried `true` (staleTime-respecting) on the theory that the post-hydration
    // refetch was replacing the seeded DOM and moving LCP. Measured on the
    // preview: LCP 7.3s → 7.6s, score 62 → 54. It is not the cause; the reload
    // behaviour this comment describes is worth more than the non-existent win.
    refetchOnMount: 'always',
    queryFn: async () => {
      const params = mobileFeedParams(surface);
      const res = await fetch(`/api/receiving-lines?${params.toString()}`);
      if (!res.ok) throw new Error('fetch failed');
      const json = (await res.json()) as ApiResponse;
      return Array.isArray(json.receiving_lines) ? json.receiving_lines : [];
    },
    realtime: {
      invalidation: { receiving: true },
      // Desktop tracking scan publishes here → surface the new carton instantly.
      ably: {
        channel: stationBridgeChannel,
        event: 'receiving_photo_request',
        enabled: !!stationBridgeChannel && staffId > 0,
      },
      refreshDomains: ['receiving.lines'],
    },
  });

  // A finished photo upload (camera or background queue) publishes here for the
  // same staff — refetch so each row's `photo_count` (the Take Photos button's
  // `x{n}` badge) ticks up. Ably echoes to the publisher, so this fires on the
  // capturing phone too, not just a paired one.
  useAblyChannel(
    phoneChannel,
    'receiving_photo_uploaded',
    refetch,
    !!phoneChannel && staffId > 0,
  );

  const stationChannel = safeChannelName(() => getStationChannelName(orgId!));
  useAblyChannel(
    stationChannel,
    'receiving-photo.changed',
    refetch,
    !!stationChannel,
  );

  const { rows, scrollRef, freshIds } = useCaptureStackWindow(data, { limit, anchor: 'bottom' });

  // Collapse carton-mates into package entries for rendering — windowing, scroll,
  // and fresh-pulse stay line-level (above) so the existing feed mechanics are
  // untouched; grouping is purely presentational.
  const entries = useMemo<ReceivingFeedEntry[]>(() => groupReceivingEntries(rows), [rows]);

  const [sheetRow, setSheetRow] = useState<ReceivingLineRow | null>(null);
  const [feedGalleryReceivingId, setFeedGalleryReceivingId] = useState<number | null>(null);
  // Re-derive the open sheet's row from the live feed so its CTA photo count
  // updates after an upload — the stored `sheetRow` snapshot would stay stale.
  const liveSheetRow = useMemo(
    () => (sheetRow ? data.find((r) => r.id === sheetRow.id) ?? sheetRow : null),
    [sheetRow, data],
  );
  const openSheet = useCallback((row: ReceivingLineRow) => setSheetRow(row), []);
  const closeSheet = useCallback(() => setSheetRow(null), []);
  const openFeedGallery = useCallback((row: ReceivingLineRow) => {
    if (!row.receiving_id) return;
    setFeedGalleryReceivingId(row.receiving_id);
  }, []);
  const closeFeedGallery = useCallback(() => setFeedGalleryReceivingId(null), []);
  const buildPhotoHrefs = useCallback((row: ReceivingLineRow) => {
    const poValue = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').toString().trim();
    const hrefs = receivingLinePhotoHrefs({
      receivingId: row.receiving_id,
      lineId: row.id,
      itemName: row.item_name,
      sku: row.sku,
      zohoItemId: row.zoho_item_id,
      poRef: poValue || undefined,
      back: surface === 'triage' ? '/m/triage' : '/m/receiving',
    });
    if (surface !== 'triage' || row.receiving_id == null) return hrefs;
    return {
      ...hrefs,
      // Arrival recent rows resume the same label → box → classify flow as a
      // fresh scan; never fall through to the generic unbox-carton camera.
      captureHref: mobileArrivalPhotosThenClassifyHref(row.receiving_id, {
        title: row.tracking_number,
      }),
    };
  }, [surface]);

  // Bottom-anchored feed: rows are oldest→newest, so the last one is the
  // bottom-most (newest) line — the only row that renders the big photo display.
  const expandedLineId = rows.length ? rows[rows.length - 1].id : null;

  const cardCallbacks = useMemo<ReceivingCardCallbacks>(
    () => ({
      buildHrefs: buildPhotoHrefs,
      onOpenGallery: openFeedGallery,
      onOpenSheet: openSheet,
      isFresh: (row) => freshIds.has(row.id),
      isExpanded: (row) => row.id === expandedLineId,
    }),
    [buildPhotoHrefs, openFeedGallery, openSheet, freshIds, expandedLineId],
  );

  return (
    <div className="flex h-full w-full max-w-full flex-col overflow-x-hidden bg-surface-card">
      <CaptureStack<ReceivingFeedEntry>
        rows={entries}
        isLoading={isLoading}
        scrollRef={scrollRef}
        getId={(entry) => entry.key}
        empty={
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface-card px-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">{INCOMING_EMPTY_TITLE}</p>
            <p className="max-w-[260px] text-role-caption font-semibold text-text-soft">
              {surface === 'triage'
                ? 'Scan a tracking number below to start an arrival.'
                : INCOMING_EMPTY_HINT}
            </p>
          </div>
        }
        renderRow={(entry) =>
          entry.kind === 'package' ? (
            <MobilePackageGroup entry={entry} cb={cardCallbacks} />
          ) : (
            <MobileReceivingUnitCard row={entry.unit} cb={cardCallbacks} />
          )
        }
      />

      {surface === 'triage' ? (
        <MobileArrivalDetailsSheet
          row={liveSheetRow}
          open={sheetRow != null}
          onClose={closeSheet}
        />
      ) : (
        <MobileCartonSheet
          row={liveSheetRow}
          staffId={staffId}
          open={sheetRow != null}
          onClose={closeSheet}
        />
      )}

      <MobileReceivingFeedGallery
        receivingId={feedGalleryReceivingId}
        staffId={staffId}
        open={feedGalleryReceivingId != null}
        onClose={closeFeedGallery}
      />
    </div>
  );
}
