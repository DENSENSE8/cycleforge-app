'use client';

/**
 * SearchOrderFeedback — `/search?sel=order:…` read surface.
 *
 * Carton-twin layout: disposition CTA bar · optional photos band · full-bleed
 * two-column body (no padded wrappers). Sibling shell — never remount desk/`/o`.
 *
 * Order resolve shares the TanStack cache seeded by header find
 * (`setSearchOrderResolveCache`) so navigation paints content without a gray
 * loading shell.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from '@/components/Icons';
import { SearchOrderDispositionBar } from '@/components/search/order-feedback/SearchOrderDispositionBar';
import { SearchOrderFactsColumn } from '@/components/search/order-feedback/SearchOrderFactsColumn';
import { SearchOrderEvidenceColumn } from '@/components/search/order-feedback/SearchOrderEvidenceColumn';
import {
  PhotoGallery,
  type PhotoGalleryInput,
} from '@/components/shipped/PhotoGallery';
import { WarrantyLogClaimDialog } from '@/components/warranty/WarrantyLogClaimDialog';
import { AnimatePresence, motion } from '@/design-system/motion';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { photoStageLabel } from '@/lib/photos/stages';
import {
  clearGlobalSearchPending,
  setGlobalSearchPending,
} from '@/lib/global-search-pending';
import { searchOrderResolveQuery } from '@/lib/search/search-order-resolve-query';
import {
  carrierEventsToTimeline,
  collapseTimeline,
  inventoryEventsToTimeline,
  orderAuditToTimeline,
  rmaEventsToTimeline,
  stationActivityToTimeline,
  threadMessagesToTimeline,
  unitPhotosToTimeline,
  type CarrierEvent,
  type InventoryTimelineRow,
  type OrderAuditRow,
  type RmaTimelineRow,
  type StationActivityRow,
  type ThreadMessageTimelineRow,
  type TimelineItem,
  type UnitTimelinePhotoRow,
} from '@/lib/timeline';
import { useRouter } from 'next/navigation';

interface OrderTimelinePayload {
  events: OrderAuditRow[];
  lifecycle: InventoryTimelineRow[];
  stationEvents: StationActivityRow[];
  threadMessages: ThreadMessageTimelineRow[];
  carrierEvents: CarrierEvent[];
  rmaEvents: RmaTimelineRow[];
  unitPhotos: UnitTimelinePhotoRow[];
}

const PHOTO_MEDIA_LIMIT = 4;

const SOURCE_STAGE = {
  arrival: 'arrival_package',
  unbox_carton: 'unbox_carton',
  unbox_item: 'unbox_item',
  testing: 'testing',
  packing: 'packing',
} as const;

function toReadOnlyGalleryInput(url: string, caption?: string): PhotoGalleryInput {
  return { url, meta: caption ? { caption } : undefined };
}

function buildGalleryPhotos(
  unitPhotos: UnitTimelinePhotoRow[],
  packerUrls: unknown,
): PhotoGalleryInput[] {
  const seen = new Set<string>();
  const out: PhotoGalleryInput[] = [];

  for (const photo of unitPhotos) {
    const url = String(photo.fullUrl || photo.thumbUrl || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(toReadOnlyGalleryInput(url, photoStageLabel(SOURCE_STAGE[photo.source])));
  }

  const legacy = Array.isArray(packerUrls) ? packerUrls : [];
  for (const entry of legacy) {
    const url =
      typeof entry === 'string'
        ? entry.trim()
        : entry && typeof entry === 'object' && 'url' in entry
          ? String((entry as { url?: unknown }).url ?? '').trim()
          : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(toReadOnlyGalleryInput(url, photoStageLabel('packing')));
  }

  return out;
}

function mergeOrderTimeline(data: OrderTimelinePayload | undefined): {
  items: TimelineItem[];
  unitPhotos: UnitTimelinePhotoRow[];
} {
  if (!data) return { items: [], unitPhotos: [] };

  const photoRows: TimelineItem[] = [];
  const bySerial = new Map<string, UnitTimelinePhotoRow[]>();
  for (const p of data.unitPhotos) {
    const sn = String(p.serial ?? '').trim();
    const arr = bySerial.get(sn);
    if (arr) arr.push(p);
    else bySerial.set(sn, [p]);
  }
  for (const [sn, list] of bySerial) {
    for (const item of unitPhotosToTimeline(list)) {
      photoRows.push({
        ...item,
        id: sn ? `serial:${sn}:${item.id}` : `order:${item.id}`,
        ref: sn ? { kind: 'serial', value: sn } : item.ref,
        media:
          item.media && item.media.length > PHOTO_MEDIA_LIMIT
            ? item.media.slice(0, PHOTO_MEDIA_LIMIT)
            : item.media,
      });
    }
  }

  const merged = [
    ...carrierEventsToTimeline(data.carrierEvents),
    ...photoRows,
    ...stationActivityToTimeline(data.stationEvents),
    ...inventoryEventsToTimeline(data.lifecycle),
    ...rmaEventsToTimeline(data.rmaEvents),
    ...threadMessagesToTimeline(data.threadMessages),
    ...orderAuditToTimeline(data.events),
  ].sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return tb - ta;
  });

  return {
    items: collapseTimeline(merged),
    unitPhotos: data.unitPhotos,
  };
}

function FeedbackEmpty({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center bg-surface-card">
      <div className="max-w-sm border border-dashed border-border-soft px-6 py-10 text-center">
        <Search className="mx-auto mb-3 h-8 w-8 text-text-faint" />
        <p className="text-role-caption font-semibold text-text-default">{title}</p>
        <p className="mt-1 text-role-caption text-text-muted">{body}</p>
      </div>
    </div>
  );
}

export function SearchOrderFeedback({ orderId }: { orderId: string | number }) {
  const router = useRouter();
  const [photosOpen, setPhotosOpen] = useState(false);
  const [logWarrantyOpen, setLogWarrantyOpen] = useState(false);

  const photosPresence = useMotionPresence(framerPresence.collapseHeight);
  const photosTransition = useMotionTransition(framerTransition.stationCollapse);

  const token = String(orderId ?? '').trim();
  const asNumber = Number(token);
  const resolveById = Number.isFinite(asNumber) && asNumber > 0;

  // One key shape — header seeds token + numeric-string aliases so `sel=order:{id}`
  // hits memory without a ternary of incompatible queryOptions.
  const resolveQuery = useQuery(searchOrderResolveQuery(token));

  const resolved = resolveQuery.data;
  const resolveStatus =
    resolveQuery.isPending || resolveQuery.isLoading
      ? 'loading'
      : resolved?.status === 'ok'
        ? 'ok'
        : resolved?.status === 'fba'
          ? 'fba'
          : resolveQuery.isError
            ? 'notfound'
            : (resolved?.status ?? 'loading');
  const order = resolved?.status === 'ok' ? resolved.order : null;

  // Deep-link without a warm cache: pulse the header, never a gray page shell.
  useEffect(() => {
    const pending = resolveStatus === 'loading';
    setGlobalSearchPending(pending);
    return () => {
      clearGlobalSearchPending();
    };
  }, [resolveStatus]);

  const numericId = order?.id ?? (resolveById ? asNumber : 0);
  const timelineQuery = useQuery({
    queryKey: ['order-timeline', numericId, 'search-feedback'],
    queryFn: async (): Promise<OrderTimelinePayload> => {
      const res = await fetch(`/api/orders/${numericId}/timeline`);
      if (!res.ok) throw new Error('Failed to fetch order timeline');
      const json = await res.json();
      return {
        events: (json.events ?? []) as OrderAuditRow[],
        lifecycle: (json.lifecycle ?? []) as InventoryTimelineRow[],
        stationEvents: (json.stationEvents ?? []) as StationActivityRow[],
        threadMessages: (json.threadMessages ?? []) as ThreadMessageTimelineRow[],
        carrierEvents: (json.carrierEvents ?? []) as CarrierEvent[],
        rmaEvents: (json.rmaEvents ?? []) as RmaTimelineRow[],
        unitPhotos: (json.unitPhotos ?? []) as UnitTimelinePhotoRow[],
      };
    },
    enabled: resolveStatus === 'ok' && Number.isFinite(numericId) && numericId > 0,
    staleTime: 30_000,
  });

  const { items: timelineItems, unitPhotos } = useMemo(
    () => mergeOrderTimeline(timelineQuery.data),
    [timelineQuery.data],
  );

  const photos = useMemo(
    () => (order ? buildGalleryPhotos(unitPhotos, order.packer_photos_url) : []),
    [order, unitPhotos],
  );

  const photosSettled = !timelineQuery.isLoading && resolveStatus === 'ok';

  if (resolveStatus === 'loading') {
    // Hold an empty canvas — header owns the pending sweep (cache miss / deep link).
    return <div className="flex h-full min-h-0 w-full flex-1 bg-surface-canvas" aria-busy />;
  }

  if (resolveStatus === 'fba') {
    return (
      <FeedbackEmpty
        title="FBA order"
        body="This order is fulfilled by Amazon (FBA). Open the durable record for channel-specific detail."
      />
    );
  }

  if (resolveStatus === 'notfound' || !order) {
    return (
      <FeedbackEmpty
        title="Order not found"
        body="No order matched this selection. Try another search hit."
      />
    );
  }

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-1 flex-col bg-surface-card"
      aria-label="Search order feedback"
      data-testid="search-order-feedback"
    >
      <SearchOrderDispositionBar
        order={order}
        photoCount={photosSettled ? photos.length : null}
        photosOpen={photosOpen}
        onTogglePhotos={() => setPhotosOpen((v) => !v)}
        onLogWarranty={() => setLogWarrantyOpen(true)}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence initial={false}>
          {photosOpen ? (
            <motion.div
              key="search-order-photos"
              initial={photosPresence.initial}
              animate={photosPresence.animate}
              exit={photosPresence.exit}
              transition={photosTransition}
              className="shrink-0 overflow-hidden border-b border-border-soft"
            >
              <div className="bg-surface-card px-3 py-3">
                <PhotoGallery
                  photos={photos}
                  orderId={String(order.order_id || '').trim() || undefined}
                  launcherTitle="Photos"
                  launcherTone="neutral"
                  launcherLayout="thumbnails"
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-h-0 min-w-0 overflow-y-auto border-b border-border-hairline xl:border-b-0 xl:border-r xl:border-border-hairline">
            <SearchOrderFactsColumn order={order} />
          </div>
          <div className="min-h-0 min-w-0 overflow-y-auto bg-surface-card">
            <SearchOrderEvidenceColumn
              order={order}
              timelineItems={timelineItems}
              timelineLoading={timelineQuery.isLoading}
            />
          </div>
        </div>
      </div>

      <WarrantyLogClaimDialog
        open={logWarrantyOpen}
        onClose={() => setLogWarrantyOpen(false)}
        onCreated={(id) => {
          router.push(`/support?mode=warranty&open=${id}`);
        }}
        initial={{
          orderId: Number(order.id) || undefined,
          serialNumber: String(order.serial_number || '')
            .split(',')
            .map((s) => s.trim())
            .find(Boolean),
          sku: order.sku || undefined,
          productTitle: order.product_title || undefined,
        }}
      />
    </div>
  );
}
