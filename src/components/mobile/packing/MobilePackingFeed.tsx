'use client';

/**
 * Packing photo feed — `/m/packing` (Scan Stations › Packing, owner
 * 2026-10-08). The packing twin of the Unbox photo feed (`/m/receiving`):
 * a bottom-anchored list of the orders this staff member packed, newest at
 * the bottom with the big camera, older rows compact with gallery + camera.
 *
 * Live: a tracking scan at the desk pack station (`POST /api/packing-logs`,
 * keyed by the packer's staff id) publishes `scan_ready` on that staff's
 * packer channel. The feed refetches so the order lands at the bottom, and
 * the shell's `PackerScanReadyCamera` opens its photo capture, which returns
 * here (`?back=/m/packing`). Photo uploads and deletes (`packer-photo.changed`)
 * and pack changes (`packer-log.changed`) refetch the counts.
 */

import { useCallback, useMemo, useState } from 'react';
import { MOBILE_V2_GUTTER_X } from '@/components/mobile/v2/MobileV2Layout';
import { MobileRowPhotoActions, MobileRowPhotoCta } from '@/components/mobile/receiving/MobileRowPhotoActions';
import { MobilePackingFeedGallery } from '@/components/mobile/packing/MobilePackingFeedGallery';
import { OrderIdChip, TrackingChip } from '@/components/ui/CopyChip';
import { resolveCarrierBrand } from '@/lib/carrier-brand';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/design-system/primitives/Button';
import { CaptureStack, useCaptureStackQuery, useCaptureStackWindow } from '@/design-system/components/capture-stack';
import { appMobilePageGroundClass } from '@/design-system/tokens/app-surface';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getLast8 } from '@/lib/copy-chip-format';
import { PACKING_PATHS } from '@/lib/nav/route-tree';
import { PACKING_FEED_LIMIT, type PackingFeedRow } from '@/lib/packing/photo-feed';
import { getPackerBridgeChannelName, getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { formatMonthDayTimePST } from '@/utils/date';

// Rows sit flush: no vertical gap between packs, one hairline between them.
const CARD_BASE = `${MOBILE_V2_GUTTER_X} overflow-hidden rounded-none border-b border-border-hairline bg-surface-card py-3`;

/** The pack's camera capture (title + order id top-left), returning to this feed. */
function captureHref(row: PackingFeedRow): string {
  const query = new URLSearchParams({ back: PACKING_PATHS.mobile, title: row.title });
  if (row.orderId) query.set('orderId', row.orderId);
  if (row.orderRowId != null) query.set('orderRowId', String(row.orderRowId));
  return `/m/p/${row.packerLogId}/photos?${query}`;
}

export function MobilePackingFeed() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const staffId = user?.staffId ?? 0;
  const packerChannel = safeChannelName(() => getPackerBridgeChannelName(orgId!, staffId));
  const stationChannel = safeChannelName(() => getStationChannelName(orgId!));

  const queryKey = useMemo(() => ['packing-photo-feed', staffId] as const, [staffId]);
  const { data, isLoading, isError, refetch } = useCaptureStackQuery<PackingFeedRow>({
    queryKey,
    // Capture is a fullscreen route: the upload push lands while this feed is
    // unmounted, so every return refetches the counts.
    refetchOnMount: 'always',
    enabled: staffId > 0,
    queryFn: async () => {
      const response = await fetch('/api/packing/photo-feed', { cache: 'no-store' });
      const body = (await response.json().catch(() => null)) as { success?: boolean; rows?: PackingFeedRow[]; error?: string } | null;
      if (!response.ok || !body?.success || !Array.isArray(body.rows)) {
        throw new Error(body?.error ?? 'Could not load your packs.');
      }
      return body.rows;
    },
    realtime: {
      // The desk tracking scan, on this staff member's packer channel.
      ably: { channel: packerChannel, event: 'scan_ready', enabled: !!packerChannel && staffId > 0 },
    },
  });
  useAblyChannel(stationChannel, 'packer-photo.changed', refetch, !!stationChannel);
  useAblyChannel(
    stationChannel,
    'packer-log.changed',
    useCallback((msg: { data?: { packerId?: number } }) => {
      if (Number(msg?.data?.packerId) === staffId) refetch();
    }, [refetch, staffId]),
    !!stationChannel && staffId > 0,
  );

  const { rows, scrollRef, freshIds } = useCaptureStackWindow(data, {
    limit: PACKING_FEED_LIMIT,
    anchor: 'bottom',
    getId: (row) => row.packerLogId,
  });
  // Only the newest pack (the bottom row) gets the big camera; the rest carry the compact pair.
  const newestId = rows.length ? rows[rows.length - 1].packerLogId : null;
  const [galleryId, setGalleryId] = useState<number | null>(null);

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${appMobilePageGroundClass}`}>
      <div className="flex shrink-0 items-center border-b border-border-hairline px-4">
        <p className="inline-flex min-h-11 items-center text-role-caption font-semibold uppercase tracking-[0.18em] text-text-muted">
          Latest {PACKING_FEED_LIMIT}
        </p>
      </div>
      {/* A flex column, so the stack's own `flex-1 overflow-y-auto` gets a bounded height and scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-card">
        <CaptureStack<PackingFeedRow>
          rows={rows}
          isLoading={isLoading}
          scrollRef={scrollRef}
          freshIds={freshIds}
          getId={(row) => row.packerLogId}
          empty={
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface-card px-6 text-center">
              {isError ? (
                <>
                  <p className="text-role-caption font-semibold text-text-danger">Could not load your packs</p>
                  <Button variant="secondary" size="lg" radius="mode" onClick={refetch}>
                    Try again
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">No packs yet</p>
                  <p className="max-w-[260px] text-role-caption font-semibold text-text-soft">
                    Scan a tracking number at the pack station to drop an order in here.
                  </p>
                </>
              )}
            </div>
          }
          renderRow={(row) => (
            <PackingFeedCard
              row={row}
              fresh={freshIds.has(row.packerLogId)}
              newest={row.packerLogId === newestId}
              onOpenGallery={() => setGalleryId(row.packerLogId)}
            />
          )}
        />
      </div>
      <MobilePackingFeedGallery packerLogId={galleryId} onClose={() => setGalleryId(null)} onChanged={refetch} />
    </div>
  );
}

/**
 * One packed order, three rows: the title; the order and tracking numbers
 * with the pack time at the far right; then gallery · camera — the big camera
 * on the newest (bottom) pack only, the compact pair on the rest. The numbers
 * are display only.
 */
function PackingFeedCard({
  row,
  fresh,
  newest,
  onOpenGallery,
}: {
  row: PackingFeedRow;
  fresh: boolean;
  newest: boolean;
  onOpenGallery: () => void;
}) {
  const href = captureHref(row);
  // Carrier from the tracking number's own prefix (the shared pattern list); unknown paints nothing.
  const carrier = row.tracking ? resolveCarrierBrand(row.tracking) : null;
  const carrierLabel = carrier && carrier.carrier !== 'Unknown' ? carrier.label : null;
  return (
    <div className={CARD_BASE}>
      <div className={`-mx-1 rounded-mode px-1 transition-colors duration-700 ${fresh ? 'bg-surface-sunken' : 'bg-transparent'}`}>
        <p className="text-base font-semibold leading-snug text-text-default">{row.title}</p>
        <div className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden">
          {/* Display only: a tap or a scroll that starts on a number never copies it.
              The order slot keeps its last-8 width, a dash when the scan matched no order. */}
          <div className="pointer-events-none flex min-w-0 flex-1 select-none items-center gap-1 overflow-hidden">
            <OrderIdChip value={row.orderId ?? ''} display={getLast8(row.orderId ?? '')} displayWidth="last8" dense />
            {row.tracking ? <TrackingChip value={row.tracking} showIcon carrierHint={row.carrier} dense /> : null}
          </div>
          {/* When it was packed — far right of the numbers row. */}
          <time dateTime={row.packedAt} className="shrink-0 text-role-caption font-semibold tabular-nums text-text-muted">
            {formatMonthDayTimePST(row.packedAt)}
          </time>
        </div>
        {newest ? (
          <MobileRowPhotoCta
            className="mt-3"
            photoCount={row.photoCount}
            galleryHref={href}
            captureHref={href}
            onOpenGallery={onOpenGallery}
          />
        ) : (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-role-caption font-semibold text-text-muted">{carrierLabel}</span>
            <MobileRowPhotoActions
              photoCount={row.photoCount}
              galleryHref={href}
              captureHref={href}
              onOpenGallery={onOpenGallery}
            />
          </div>
        )}
      </div>
    </div>
  );
}
