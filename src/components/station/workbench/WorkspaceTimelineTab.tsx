'use client';

/**
 * Universal station Timeline display — {@link SectionTabsSlider} spines
 * (Units default · Tracking = full carrier display). Shared by Unbox,
 * Testing, Shipping, and Packing Displays.
 *
 * Flush plane on the push column (no WorkspaceCard glass island) — same
 * recipe as Classify / Package Pairing bare chrome.
 *
 * Carrier data paths:
 *   - poId → Incoming details query (same cache as Incoming Shipment tab)
 *   - tracking (no po) → Operations journey dim=tracking
 *   - orderId (no po/tracking) → Operations journey dim=order
 *
 * Serials: explicit list, else carton fetch via {@link useCartonSerials}.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Barcode, History, MapPin } from '@/components/Icons';
import { SectionTabsSlider, type SectionTab } from '@/design-system/components';
import {
  CarrierTrackingSection,
  type CarrierShipmentView,
} from '@/components/sidebar/receiving/incoming-details/CarrierTrackingSection';
import type { DetailsResponse } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { useCartonSerials } from '@/hooks/useCartonSerials';
import {
  operationsJourneyFocusedQuery,
  type JourneyResponse,
} from '@/lib/queries/operations-journey-queries';
import type { CarrierEvent } from '@/lib/timeline';
import type { TimelineItem } from '@/lib/timeline/types';
import type { JourneyUrlFilters } from '@/components/sidebar/operations/useOperationsTimelineUrlState';
import { TimelineSection } from '@/components/ui/TimelineSection';
import {
  normalizeExplicitSerials,
  resolveTimelineSections,
  type WorkspaceTimelineAnchor,
} from './resolve-timeline-sections';
import { StationUnitJourneys } from './StationUnitJourneys';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';

/** Flush Displays body — no WorkspaceCard glass island (scan-station SoT). */
const TIMELINE_FLUSH_HOST_CLASS = cn('min-w-0', cornerClass('flush'));
export type { WorkspaceTimelineAnchor } from './resolve-timeline-sections';

type TimelineSpine = 'units' | 'tracking' | 'activity';

function emptyJourneyFilters(partial: Partial<JourneyUrlFilters> & Pick<JourneyUrlFilters, 'dim'>): JourneyUrlFilters {
  return {
    dim: partial.dim,
    order: partial.order ?? null,
    serial: partial.serial ?? null,
    tracking: partial.tracking ?? null,
    unit: partial.unit ?? null,
    from: null,
    until: null,
    stations: [],
    types: [],
    status: null,
    staffId: null,
    sources: [],
    q: null,
  };
}

function isDeliveredCategory(category: string | null | undefined): boolean {
  const c = (category || '').toLowerCase();
  return c.includes('deliver') && !c.includes('out');
}

/** Build a CarrierShipmentView from a focused journey response (tracking/order). */
export function shipmentFromJourney(
  journey: JourneyResponse | undefined,
  trackingFallback: string | null,
): CarrierShipmentView | null {
  const shipmentId = journey?.entity?.shipmentId;
  if (shipmentId == null || !Number.isFinite(shipmentId) || shipmentId <= 0) return null;

  const carrierEvents = (journey?.events ?? [])
    .filter((e) => e.source === 'carrier')
    .map((e) => e.raw as CarrierEvent)
    .sort((a, b) => {
      const ta = a.event_occurred_at ? new Date(a.event_occurred_at).getTime() : 0;
      const tb = b.event_occurred_at ? new Date(b.event_occurred_at).getTime() : 0;
      return tb - ta;
    });

  const latest = carrierEvents[0];
  const tracking =
    trackingFallback?.trim() ||
    journey?.entity?.trackingNumbers?.[0]?.trim() ||
    null;

  return {
    shipment_id: shipmentId,
    tracking_number: tracking,
    carrier: null,
    latest_status_category: latest?.normalized_status_category ?? null,
    is_delivered: latest ? isDeliveredCategory(latest.normalized_status_category) : null,
    delivered_at: null,
    last_checked_at: null,
    out_for_delivery_at: null,
    events: carrierEvents,
  };
}

type CarrierLoadState = {
  shipment: CarrierShipmentView | null;
  loading: boolean;
  error: boolean;
  emptyMessage: string | null;
};

function usePoCarrier(poId: string, enabled: boolean): CarrierLoadState {
  const { data, isLoading, isError } = useQuery<DetailsResponse>({
    queryKey: ['incoming-details', poId],
    queryFn: async () => {
      const res = await fetch(
        `/api/receiving-lines/incoming/details?po_id=${encodeURIComponent(poId)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`details ${res.status}`);
      return res.json();
    },
    enabled: enabled && poId.length > 0,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  if (!enabled) {
    return { shipment: null, loading: false, error: false, emptyMessage: null };
  }
  if (isLoading) {
    return { shipment: null, loading: true, error: false, emptyMessage: null };
  }
  if (isError || !data) {
    return {
      shipment: null,
      loading: false,
      error: true,
      emptyMessage: 'Could not load carrier tracking.',
    };
  }
  if (!data.shipment) {
    return {
      shipment: null,
      loading: false,
      error: false,
      emptyMessage: 'No shipment linked yet for this PO.',
    };
  }
  return { shipment: data.shipment, loading: false, error: false, emptyMessage: null };
}

function useJourneyCarrier(
  filters: JourneyUrlFilters | null,
  trackingFallback: string | null,
  enabled: boolean,
): CarrierLoadState {
  const query = useQuery({
    ...operationsJourneyFocusedQuery(filters ?? emptyJourneyFilters({ dim: 'tracking' })),
    enabled:
      enabled &&
      Boolean(
        filters &&
          ((filters.dim === 'tracking' && filters.tracking?.trim()) ||
            (filters.dim === 'order' && filters.order?.trim())),
      ),
  });

  if (!enabled || !filters) {
    return { shipment: null, loading: false, error: false, emptyMessage: null };
  }
  if (query.isLoading) {
    return { shipment: null, loading: true, error: false, emptyMessage: null };
  }
  if (query.isError) {
    return {
      shipment: null,
      loading: false,
      error: true,
      emptyMessage: 'Could not load carrier tracking.',
    };
  }
  const shipment = shipmentFromJourney(query.data, trackingFallback);
  if (!shipment) {
    return {
      shipment: null,
      loading: false,
      error: false,
      emptyMessage: 'No shipment linked yet.',
    };
  }
  return { shipment, loading: false, error: false, emptyMessage: null };
}

function CarrierPanel({ carrier }: { carrier: CarrierLoadState }) {
  if (carrier.shipment) {
    return <CarrierTrackingSection shipment={carrier.shipment} stationCompact />;
  }
  if (carrier.loading) {
    return (
      <UniversalLoader isLoading label="Loading tracking" className="min-h-24" />
    );
  }
  return (
    <div
      className={`rounded-xl border border-dashed px-4 py-4 text-center text-role-caption ${
        carrier.error
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-border-soft bg-surface-canvas font-medium text-text-soft'
      }`}
    >
      {carrier.emptyMessage ?? 'Could not load carrier tracking.'}
    </div>
  );
}

function UnitsPanel({
  serials,
  loading,
}: {
  serials: string[];
  loading: boolean;
}) {
  return <StationUnitJourneys serials={serials} loading={loading} />;
}

function ActivityPanel({
  items,
  loading,
}: {
  items: TimelineItem[];
  loading: boolean;
}) {
  return (
    <TimelineSection
      title="Activity"
      items={items}
      loading={loading}
      density="compact"
      metaTrail
      emptyMessage="No activity yet — link tracking or scan at the dock."
      headerRight={
        !loading && items.length > 0 ? <span>{items.length} events</span> : undefined
      }
    />
  );
}

export function WorkspaceTimelineTab(props: WorkspaceTimelineAnchor) {
  const tracking = String(props.tracking ?? '').trim();
  const orderId = String(props.orderId ?? '').trim();
  const poId = String(props.poId ?? '').trim();
  const receivingId = props.receivingId ?? null;
  const activity = props.activity ?? null;
  const explicitSerials = useMemo(
    () => normalizeExplicitSerials(props.serials),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serialize list identity
    [JSON.stringify(props.serials ?? [])],
  );

  const plan = useMemo(
    () =>
      resolveTimelineSections({
        poId,
        tracking,
        orderId,
        receivingId,
        serials: explicitSerials,
        activity: props.activity,
      }),
    [poId, tracking, orderId, receivingId, explicitSerials, props.activity],
  );
  const showActivity = plan.showActivity && activity != null;

  const carton = useCartonSerials(plan.fetchCartonSerials ? receivingId : null);
  const serials = plan.fetchCartonSerials ? carton.serials : explicitSerials;
  const serialsLoading = plan.fetchCartonSerials && carton.isLoading;

  const journeyFilters = useMemo(() => {
    if (plan.carrierVia === 'tracking' && tracking) {
      return emptyJourneyFilters({ dim: 'tracking', tracking });
    }
    if (plan.carrierVia === 'order' && orderId) {
      return emptyJourneyFilters({ dim: 'order', order: orderId });
    }
    return null;
  }, [plan.carrierVia, tracking, orderId]);

  const poCarrier = usePoCarrier(poId, plan.showCarrier && plan.carrierVia === 'po');
  const journeyCarrier = useJourneyCarrier(
    journeyFilters,
    tracking || null,
    plan.showCarrier && plan.carrierVia !== 'po',
  );
  const carrier = plan.carrierVia === 'po' ? poCarrier : journeyCarrier;

  // Activity leads when present (Support Timeline); else Units → Tracking.
  const [spine, setSpine] = useState<TimelineSpine>(() =>
    props.activity != null ? 'activity' : 'units',
  );

  useEffect(() => {
    if (showActivity) setSpine('activity');
    else if (plan.showSerials) setSpine('units');
    else if (plan.showCarrier) setSpine('tracking');
  }, [poId, receivingId, tracking, orderId, plan.showSerials, plan.showCarrier, showActivity]);

  const tabs = useMemo((): SectionTab[] => {
    const next: SectionTab[] = [];
    if (showActivity && activity) {
      next.push({
        id: 'activity',
        label: 'Activity',
        icon: History,
        content: (
          <ActivityPanel items={activity.items} loading={Boolean(activity.loading)} />
        ),
      });
    }
    if (plan.showSerials) {
      next.push({
        id: 'units',
        label: 'Units',
        icon: Barcode,
        content: <UnitsPanel serials={serials} loading={serialsLoading} />,
      });
    }
    if (plan.showCarrier) {
      next.push({
        id: 'tracking',
        label: 'Tracking',
        icon: MapPin,
        content: <CarrierPanel carrier={carrier} />,
      });
    }
    return next;
    // carrier fields — not the whole load object — so identity is stable across renders
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional field deps
  }, [
    plan.showSerials,
    plan.showCarrier,
    showActivity,
    activity?.items,
    activity?.loading,
    serials,
    serialsLoading,
    carrier.shipment,
    carrier.loading,
    carrier.error,
    carrier.emptyMessage,
  ]);

  const activeId =
    tabs.some((t) => t.id === spine) ? spine : (tabs[0]?.id as TimelineSpine | undefined);

  const hasAnyContent = plan.hasContent;

  if (!hasAnyContent || tabs.length === 0) {
    return (
      <div className={TIMELINE_FLUSH_HOST_CLASS}>
        <div className="border-b border-border-soft bg-surface-card px-3 py-6 text-center text-role-caption font-medium text-text-soft">
          Scan a serial or attach tracking to see history.
        </div>
      </div>
    );
  }

  // Single spine: no slider bar (SectionTabsSlider hides pills when length === 1).
  let body: ReactNode;
  if (tabs.length === 1) {
    body = tabs[0]!.content;
  } else {
    body = (
      <SectionTabsSlider
        tabs={tabs}
        value={activeId ?? (showActivity ? 'activity' : 'units')}
        onChange={(id) => setSpine(id as TimelineSpine)}
        ariaLabel="Timeline spine"
      />
    );
  }

  return <div className={TIMELINE_FLUSH_HOST_CLASS}>{body}</div>;
}
