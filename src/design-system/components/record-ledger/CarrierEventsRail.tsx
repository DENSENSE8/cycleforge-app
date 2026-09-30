'use client';

/**
 * The carrier's scans on the shared `StepRail`, chronological left → right —
 * the External half of a record's fulfillment (outbound: the order handed to
 * the carrier; inbound: the carrier bringing the purchase to the dock).
 * Presentational: the host reads the events (`shipment_tracking_events`) and
 * passes them newest-first, as every carrier-event read returns them.
 */

import { Truck } from '@/components/Icons';
import { LatestEdgeScroller } from '@/design-system/components/record-ledger/LatestEdgeScroller';
import { StepRail, type RailStep } from '@/design-system/components/record-ledger/StepRail';
import { carrierStatusTone } from '@/lib/orders/order-fulfillment-summary';
import type { CarrierEvent } from '@/lib/queries/carrier-events-query';
import { formatMonthDayTimePST } from '@/utils/date';

function carrierEventTitle(event: CarrierEvent): string {
  const category = String(event.category ?? '').replaceAll('_', ' ').toLowerCase();
  return String(event.description ?? event.label ?? (category || 'Carrier update')).trim();
}

export function CarrierEventsRail({
  events,
  carrier,
  loading,
  error,
  testId = 'record-carrier-events',
}: {
  /** Newest first. */
  events: readonly CarrierEvent[];
  /** The shipment's carrier code — USPS has no live integration yet. */
  carrier: string | null;
  loading: boolean;
  error: boolean;
  testId?: string;
}) {
  const integrationPending = String(carrier ?? '').trim().toUpperCase() === 'USPS';
  const rail: RailStep[] = integrationPending
    ? [{
        id: 'carrier:integration-pending',
        icon: <Truck aria-hidden />,
        state: 'current',
        tone: 'neutral',
        title: 'USPS integration pending',
        meta: 'Live carrier updates are not connected yet',
      } satisfies RailStep]
    : events.length > 0
    ? [...events].reverse().map((event) => {
        const location = [event.city, event.state].filter(Boolean).join(', ');
        return {
          id: `carrier:${event.id}`,
          icon: <Truck aria-hidden />,
          state: 'done',
          tone: carrierStatusTone(event.category),
          title: carrierEventTitle(event),
          meta: [event.eventOccurredAt ? formatMonthDayTimePST(event.eventOccurredAt) : null, location || null]
            .filter(Boolean)
            .join(' · ') || undefined,
          detail: event.exception ?? (event.signedBy ? `Signed by ${event.signedBy}` : undefined),
        } satisfies RailStep;
      })
    : [{
        id: 'carrier:pending',
        icon: <Truck aria-hidden />,
        state: loading ? 'pending' : 'current',
        tone: error ? 'danger' : 'neutral',
        title: error ? 'Carrier updates unavailable' : 'Carrier handoff',
        meta: loading ? 'Loading updates' : 'Awaiting first carrier event',
      } satisfies RailStep];

  return (
    <div className="min-w-0 px-4 py-3" data-testid={testId}>
      <LatestEdgeScroller latestKey={rail.at(-1)?.id ?? null} testId="carrier-fulfillment-scroll">
        <StepRail
          steps={rail}
          size="lg"
          label="Carrier fulfillment events"
          orientation="horizontal"
          horizontalScroll
        />
      </LatestEdgeScroller>
    </div>
  );
}
