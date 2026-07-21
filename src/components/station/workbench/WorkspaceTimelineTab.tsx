'use client';

/**
 * Universal station Timeline tab — {@link SectionTabsSlider} spines
 * (Units default · Tracking = full carrier display). Shared by Unbox,
 * Testing, Shipping, and Packing.
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
import { Barcode, Loader2, MapPin } from '@/components/Icons';
import { SectionTabsSlider, WorkspaceCard, type SectionTab } from '@/design-system/components';
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
import type { JourneyUrlFilters } from '@/components/sidebar/operations/useOperationsTimelineUrlState';
import {
  normalizeExplicitSerials,
  resolveTimelineSections,
  type WorkspaceTimelineAnchor,
} from './resolve-timeline-sections';
import { StationUnitJourneys } from './StationUnitJourneys';

export type { WorkspaceTimelineAnchor } from './resolve-timeline-sections';
export { resolveTimelineSections } from './resolve-timeline-sections';

type TimelineSpine = 'units' | 'tracking';

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
      <div className="flex items-center gap-2 px-1 py-4 text-role-caption text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading tracking…
      </div>
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

export function WorkspaceTimelineTab(props: WorkspaceTimelineAnchor) {
  const tracking = String(props.tracking ?? '').trim();
  const orderId = String(props.orderId ?? '').trim();
  const poId = String(props.poId ?? '').trim();
  const receivingId = props.receivingId ?? null;
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
      }),
    [poId, tracking, orderId, receivingId, explicitSerials],
  );

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

  const [spine, setSpine] = useState<TimelineSpine>('units');

  // Carton identity change → Units default when serials exist.
  useEffect(() => {
    setSpine(plan.showSerials ? 'units' : 'tracking');
  }, [poId, receivingId, tracking, orderId, plan.showSerials]);

  const tabs = useMemo((): SectionTab[] => {
    const next: SectionTab[] = [];
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
    serials,
    serialsLoading,
    carrier.shipment,
    carrier.loading,
    carrier.error,
    carrier.emptyMessage,
  ]);

  const activeId =
    tabs.some((t) => t.id === spine) ? spine : (tabs[0]?.id as TimelineSpine | undefined);

  if (!plan.hasContent || tabs.length === 0) {
    return (
      <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center text-role-caption font-medium text-text-soft">
          Scan a serial or attach tracking to see history.
        </div>
      </WorkspaceCard>
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
        value={activeId ?? 'units'}
        onChange={(id) => setSpine(id as TimelineSpine)}
        ariaLabel="Timeline spine"
      />
    );
  }

  return (
    <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
      {body}
    </WorkspaceCard>
  );
}
