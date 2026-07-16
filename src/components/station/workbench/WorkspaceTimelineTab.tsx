'use client';

/**
 * Universal station Timeline tab — carrier tracking hero/events + per-serial
 * journeys. Shared by Unbox, Testing, Shipping, and Packing.
 *
 * Carrier data paths:
 *   - poId → Incoming details query (same cache as Incoming Shipment tab)
 *   - tracking (no po) → Operations journey dim=tracking
 *   - orderId (no po/tracking) → Operations journey dim=order
 *
 * Serials: explicit list, else carton fetch via {@link useCartonSerials}.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@/components/Icons';
import { WorkspaceCard } from '@/design-system/components';
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

function emptyJourneyFilters(partial: Partial<JourneyUrlFilters> & Pick<JourneyUrlFilters, 'dim'>): JourneyUrlFilters {
  return {
    dim: partial.dim,
    order: partial.order ?? null,
    serial: partial.serial ?? null,
    tracking: partial.tracking ?? null,
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

function PoCarrierBlock({ poId }: { poId: string }) {
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
    enabled: poId.length > 0,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-4 text-role-caption text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading tracking…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-4 text-center text-role-caption text-rose-700">
        Could not load carrier tracking.
      </div>
    );
  }
  if (!data.shipment) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-4 text-center text-role-caption font-medium text-text-soft">
        No shipment linked yet for this PO.
      </div>
    );
  }
  return <CarrierTrackingSection shipment={data.shipment} stationCompact />;
}

function JourneyCarrierBlock({
  filters,
  trackingFallback,
}: {
  filters: JourneyUrlFilters;
  trackingFallback: string | null;
}) {
  const query = useQuery({
    ...operationsJourneyFocusedQuery(filters),
    enabled: Boolean(
      (filters.dim === 'tracking' && filters.tracking?.trim()) ||
        (filters.dim === 'order' && filters.order?.trim()),
    ),
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 px-1 py-4 text-role-caption text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading tracking…
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-4 text-center text-role-caption text-rose-700">
        Could not load carrier tracking.
      </div>
    );
  }

  const shipment = shipmentFromJourney(query.data, trackingFallback);
  if (!shipment) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-4 text-center text-role-caption font-medium text-text-soft">
        No shipment linked yet.
      </div>
    );
  }
  return <CarrierTrackingSection shipment={shipment} stationCompact />;
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

  const journeyFilters = useMemo(() => {
    if (plan.carrierVia === 'tracking' && tracking) {
      return emptyJourneyFilters({ dim: 'tracking', tracking });
    }
    if (plan.carrierVia === 'order' && orderId) {
      return emptyJourneyFilters({ dim: 'order', order: orderId });
    }
    return null;
  }, [plan.carrierVia, tracking, orderId]);

  if (!plan.hasContent) {
    return (
      <WorkspaceCard variant="glass" overflow="visible" bodyClassName="p-4">
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center text-role-caption font-medium text-text-soft">
          Scan a serial or attach tracking to see history.
        </div>
      </WorkspaceCard>
    );
  }

  return (
    <WorkspaceCard variant="glass" overflow="visible" bodyClassName="space-y-4 p-4">
      {plan.showCarrier ? (
        plan.carrierVia === 'po' && poId ? (
          <PoCarrierBlock poId={poId} />
        ) : journeyFilters ? (
          <JourneyCarrierBlock filters={journeyFilters} trackingFallback={tracking || null} />
        ) : null
      ) : null}

      {plan.showSerials ? (
        <StationUnitJourneys
          serials={serials}
          loading={plan.fetchCartonSerials && carton.isLoading}
        />
      ) : null}
    </WorkspaceCard>
  );
}
