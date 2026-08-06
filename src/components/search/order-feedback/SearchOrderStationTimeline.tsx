'use client';

/**
 * SearchOrderStationTimeline — packing-first station sections, only when a
 * section has events or a tested stamp. Always open (no collapse).
 */

import { useMemo } from 'react';
import { PipelineStageRow } from '@/design-system/components';
import { TimelineSection } from '@/components/ui/TimelineSection';
import {
  deriveShippingDisplayMeta,
  serialNumberRowsFromShipped,
} from '@/components/shipped/details-panel/shipping-information/helpers';
import {
  ORDER_STATION_PACKING_FIRST_IDS,
  ORDER_STATION_SECTION_LABELS,
  countTimelineByStation,
  filterTimelineByStation,
  type OrderStationSectionId,
  type TimelineItem,
} from '@/lib/timeline';
import type { ShippedOrder } from '@/types/orders';

function StationMilestones({
  station,
  order,
}: {
  station: OrderStationSectionId;
  order: ShippedOrder;
}) {
  if (station !== 'testing') return null;

  const serials = serialNumberRowsFromShipped(order);
  const meta = deriveShippingDisplayMeta(order, serials);
  if (!meta.testedAtSource) return null;

  return (
    <div className="divide-y divide-border-hairline border-b border-border-hairline px-3">
      <PipelineStageRow
        label="Tested"
        at={meta.testedAtSource}
        staffName={meta.techNameDisplay}
        emptyFallback="Not tested"
      />
    </div>
  );
}

function stationHasContent(
  station: OrderStationSectionId,
  count: number,
  order: ShippedOrder,
): boolean {
  if (count > 0) return true;
  if (station === 'testing') {
    const serials = serialNumberRowsFromShipped(order);
    return Boolean(deriveShippingDisplayMeta(order, serials).testedAtSource);
  }
  return false;
}

function StationSectionRow({
  station,
  order,
  items,
  count,
  loading,
}: {
  station: OrderStationSectionId;
  order: ShippedOrder;
  items: TimelineItem[];
  count: number;
  loading?: boolean;
}) {
  const label = ORDER_STATION_SECTION_LABELS[station];

  return (
    <section className="border-b border-border-hairline last:border-b-0">
      <header className="flex w-full items-center gap-2 bg-surface-sunken px-3 py-2.5">
        <span className="min-w-0 flex-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
          {label}
        </span>
        <span className="text-role-micro tabular-nums uppercase tracking-widest text-text-faint">
          {count}
        </span>
      </header>

      <div className="bg-surface-card">
        <StationMilestones station={station} order={order} />
        {count > 0 || loading ? (
          <TimelineSection
            items={items}
            loading={loading}
            density="compact"
            metaTrail
            title="Activity"
            className="px-3 pt-3 pb-4"
            emptyMessage={`No ${label.toLowerCase()} events yet.`}
            headerRight={
              !loading && items.length > 0 ? (
                <span>{items.length} events</span>
              ) : undefined
            }
          />
        ) : null}
      </div>
    </section>
  );
}

export function SearchOrderStationTimeline({
  order,
  items,
  loading,
}: {
  order: ShippedOrder;
  items: TimelineItem[];
  loading?: boolean;
}) {
  const counts = useMemo(() => countTimelineByStation(items), [items]);

  const byStation = useMemo(() => {
    const map = {} as Record<OrderStationSectionId, TimelineItem[]>;
    for (const id of ORDER_STATION_PACKING_FIRST_IDS) {
      map[id] = filterTimelineByStation(items, id);
    }
    return map;
  }, [items]);

  const visible = useMemo(
    () =>
      ORDER_STATION_PACKING_FIRST_IDS.filter((id) =>
        stationHasContent(id, counts[id], order),
      ),
    [counts, order],
  );

  if (loading) {
    return (
      <div
        className="px-4 py-3 text-role-caption font-medium text-text-muted"
        data-testid="search-order-station-timeline"
      >
        Loading activity…
      </div>
    );
  }

  if (visible.length === 0) return null;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-surface-card"
      data-testid="search-order-station-timeline"
    >
      {visible.map((id) => (
        <StationSectionRow
          key={id}
          station={id}
          order={order}
          items={byStation[id]}
          count={counts[id]}
          loading={false}
        />
      ))}
    </div>
  );
}
