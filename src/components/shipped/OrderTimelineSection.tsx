'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { TimelineSection } from '@/components/ui/TimelineSection';
import { IdentifierToggle } from '@/components/ui/IdentifierToggle';
import type { TimelineGroupMode } from '@/components/ui/EventTimeline';
import {
  orderAuditToTimeline,
  inventoryEventsToTimeline,
  stationActivityToTimeline,
  threadMessagesToTimeline,
  carrierEventsToTimeline,
  rmaEventsToTimeline,
  unitPhotosToTimeline,
  collapseTimeline,
  type TimelineItem,
  type UnitTimelinePhotoRow,
} from '@/lib/timeline';
import { orderTimelineQuery } from '@/lib/queries/order-timeline-query';

/**
 * Order activity timeline — merges every spine the order touches, newest-first,
 * through the shared {@link EventTimeline}.
 *
 * Spines: order `audit_logs` (with field-level diffs when the caller holds
 * `admin.view_logs`) · unit `inventory_events` · station scans · thread
 * messages · carrier tracking scans · RMA authorizations.
 *
 * Each spine degrades independently server-side, so a carrier or RMA outage
 * renders that lens empty rather than taking down the record.
 *
 * Allocated/shipped serials also carry five-stage photo evidence (arrival /
 * unbox carton / unbox item / testing / packing). Those rows are COLLAPSED by
 * default behind the header "Photos" toggle so the trail stays dense, and they
 * are tagged into the `ops` lens — evidence is operational, so narrowing to
 * Notes or System must still hide them.
 */

/** Thumbnails per photo row; a full stage burst would swamp the trail. */
const ORDER_PHOTO_MEDIA_LIMIT = 4;

/** Serial↔order toggle options for the order timeline header. */
const ORDER_TIMELINE_TOGGLE_OPTIONS: ReadonlyArray<{ value: TimelineGroupMode; label: string }> = [
  { value: 'time', label: 'Order' },
  { value: 'serial', label: 'Serial' },
];

/**
 * Lens for the segmented filter. Merging six heterogeneous spines into one
 * stream is only usable if the operator can narrow it — "where is the package"
 * and "who edited this" are different questions asked of the same trail.
 *
 * The tag lives here, at merge time, rather than on the shared `TimelineItem`:
 * it is this surface's grouping of spines, not a property of an event.
 */
type OrderTimelineLens = 'all' | 'carrier' | 'ops' | 'notes' | 'system';

const LENS_OPTIONS: ReadonlyArray<{ value: OrderTimelineLens; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'carrier', label: 'Carrier' },
  { value: 'ops', label: 'Ops' },
  { value: 'notes', label: 'Notes' },
  { value: 'system', label: 'System' },
];

interface TaggedItem {
  item: TimelineItem;
  lens: Exclude<OrderTimelineLens, 'all'>;
}

function tag(items: TimelineItem[], lens: TaggedItem['lens']): TaggedItem[] {
  return items.map((item) => ({ item, lens }));
}

export function OrderTimelineSection({
  orderId,
  flush = false,
  initialLens = 'all',
}: {
  orderId: number;
  flush?: boolean;
  initialLens?: OrderTimelineLens;
}) {
  const [groupMode, setGroupMode] = useState<TimelineGroupMode>('time');
  const [lens, setLens] = useState<OrderTimelineLens>(initialLens);
  const [showPhotos, setShowPhotos] = useState(false);

  const { data, isLoading } = useQuery(orderTimelineQuery(orderId));

  // Serial-grouped photo stage rows: bucket the flat photo payload by the
  // serial each row carries, run each unit through the shared stage adapter,
  // then namespace ids + attach a serial ref so the Serial view bands them.
  const photoRows = useMemo<TimelineItem[]>(() => {
    const photos = data?.unitPhotos ?? [];
    if (photos.length === 0) return [];
    const bySerial = new Map<string, UnitTimelinePhotoRow[]>();
    for (const p of photos) {
      const sn = String(p.serial ?? '').trim();
      const arr = bySerial.get(sn);
      if (arr) arr.push(p);
      else bySerial.set(sn, [p]);
    }
    const rows: TimelineItem[] = [];
    for (const [sn, list] of bySerial) {
      for (const item of unitPhotosToTimeline(list)) {
        rows.push({
          ...item,
          id: sn ? `serial:${sn}:${item.id}` : `order:${item.id}`,
          ref: sn ? { kind: 'serial', value: sn } : item.ref,
          media:
            item.media && item.media.length > ORDER_PHOTO_MEDIA_LIMIT
              ? item.media.slice(0, ORDER_PHOTO_MEDIA_LIMIT)
              : item.media,
        });
      }
    }
    return rows;
  }, [data?.unitPhotos]);

  const photoCount = data?.unitPhotos?.length ?? 0;

  // Merge all spines and re-sort newest-first (EventTimeline day-groups in
  // array order, so the merged list must be ordered, not just concatenated).
  const tagged = useMemo(
    () =>
      [
        ...tag(carrierEventsToTimeline(data?.carrierEvents ?? []), 'carrier'),
        // Photo evidence is operational, so it rides the `ops` lens rather than
        // bypassing the filter — but only once the operator opts in.
        ...(showPhotos ? tag(photoRows, 'ops') : []),
        ...tag(stationActivityToTimeline(data?.stationEvents ?? []), 'ops'),
        ...tag(inventoryEventsToTimeline(data?.lifecycle ?? []), 'ops'),
        ...tag(rmaEventsToTimeline(data?.rmaEvents ?? []), 'ops'),
        ...tag(threadMessagesToTimeline(data?.threadMessages ?? []), 'notes'),
        ...tag(orderAuditToTimeline(data?.events ?? []), 'system'),
      ].sort((a, b) => {
        const ta = a.item.at ? new Date(a.item.at).getTime() : 0;
        const tb = b.item.at ? new Date(b.item.at).getTime() : 0;
        return tb - ta;
      }),
    [
      data?.events,
      data?.lifecycle,
      data?.stationEvents,
      data?.threadMessages,
      data?.carrierEvents,
      data?.rmaEvents,
      photoRows,
      showPhotos,
    ],
  );

  // Collapse AFTER filtering: adjacent-duplicate folding is only correct within
  // the list actually being rendered — collapsing first would fold rows whose
  // neighbours a lens is about to remove.
  const items = useMemo(
    () =>
      collapseTimeline(
        tagged.filter((t) => lens === 'all' || t.lens === lens).map((t) => t.item),
      ),
    [tagged, lens],
  );

  // Only offer a lens that has rows — an empty segment is a dead control.
  const availableLenses = useMemo(() => {
    const present = new Set(tagged.map((t) => t.lens));
    return LENS_OPTIONS.filter((o) => o.value === 'all' || present.has(o.value));
  }, [tagged]);

  // Only offer the serial view when there's at least one identifier to group by.
  const hasSerials = useMemo(() => items.some((it) => it.ref), [items]);

  return (
    <TimelineSection
      items={items}
      loading={isLoading}
      groupMode={groupMode}
      className={
        flush
          ? 'border-t border-border-hairline px-3 pt-3 pb-6'
          : 'mx-8 mt-2 border-t border-border-hairline pt-4 pb-8'
      }
      emptyMessage={
        lens === 'all' ? undefined : 'No events in this lens — switch back to All.'
      }
      headerRight={
        !isLoading && (tagged.length > 0 || photoCount > 0) ? (
          <div className="flex items-center gap-3">
            {photoCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPhotos((v) => !v)}
                className="-my-1 h-auto gap-1 px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest text-text-faint hover:text-text-muted"
              >
                <Camera className="h-3.5 w-3.5" />
                {showPhotos ? 'Hide photos' : `Photos (${photoCount})`}
              </Button>
            ) : null}
            {availableLenses.length > 2 ? (
              <IdentifierToggle
                value={lens}
                onChange={setLens}
                options={availableLenses}
                ariaLabel="Timeline source"
              />
            ) : null}
            {hasSerials ? (
              <IdentifierToggle
                value={groupMode}
                onChange={setGroupMode}
                options={ORDER_TIMELINE_TOGGLE_OPTIONS}
                ariaLabel="Timeline grouping"
              />
            ) : null}
            <span>{items.length} events</span>
          </div>
        ) : undefined
      }
    />
  );
}
