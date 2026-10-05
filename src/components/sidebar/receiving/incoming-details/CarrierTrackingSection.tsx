'use client';

/**
 * Carrier tracking hero + event rail — shared by Incoming Shipment tab and the
 * station WorkspaceTimelineTab. Owns re-poll against `/api/shipping/track/sync-one`
 * and renders through {@link EventTimeline} via `carrierEventsToTimeline`.
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import { EventTimeline } from '@/components/ui/EventTimeline';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { carrierEventsToTimeline, type CarrierEvent } from '@/lib/timeline';
import { toast } from '@/lib/toast';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import {
  deliveredAgoLabel,
  fmtDateTime,
  heroTone,
  prettyStatus,
  shortCarrier,
} from './incoming-details-shared';

/** Shipment shape shared by Incoming details + journey-derived carriers. */
export interface CarrierShipmentView {
  shipment_id: number;
  tracking_number: string | null;
  carrier: string | null;
  latest_status_category: string | null;
  is_delivered: boolean | null;
  delivered_at: string | null;
  last_checked_at: string | null;
  out_for_delivery_at: string | null;
  events: CarrierEvent[];
}

/**
 * Which pieces to render. Station Timeline keeps the hero sticky and swaps the
 * events rail behind a spine switcher (`hero` + `events` separately).
 */
type CarrierTrackingParts = 'all' | 'hero' | 'events';

const EMPTY_INVALIDATE_KEYS: ReadonlyArray<ReadonlyArray<unknown>> = [];

export function CarrierTrackingSection({
  shipment,
  /** Extra React Query keys to invalidate after a successful re-poll. */
  invalidateKeys = EMPTY_INVALIDATE_KEYS,
  /**
   * Station Timeline density: prefer delivered headline when known, and collapse
   * the empty carrier-events band to one quiet line (no tall empty state).
   */
  stationCompact = false,
  parts = 'all',
}: {
  shipment: CarrierShipmentView;
  invalidateKeys?: ReadonlyArray<ReadonlyArray<unknown>>;
  stationCompact?: boolean;
  parts?: CarrierTrackingParts;
}) {
  const queryClient = useQueryClient();
  const [repolling, setRepolling] = useState(false);

  const repoll = useCallback(async () => {
    setRepolling(true);
    try {
      const res = await fetch('/api/shipping/track/sync-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId: shipment.shipment_id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || `Re-poll failed (${res.status})`);
        return;
      }
      toast.success(`Refreshed · ${body.status ?? 'updated'}`);
      queryClient.invalidateQueries({ queryKey: ['incoming-details'] });
      queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
      queryClient.invalidateQueries({ queryKey: ['nav-facets'] });
      queryClient.invalidateQueries({ queryKey: ['ops-journey'] });
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: [...key] });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Re-poll failed');
    } finally {
      setRepolling(false);
    }
  }, [shipment.shipment_id, queryClient, invalidateKeys]);

  const tone = heroTone(shipment.latest_status_category, shipment.is_delivered);
  // Facts drive chrome: delivered flag wins over a missing/unknown category label.
  const headline = shipment.is_delivered
    ? 'Delivered'
    : prettyStatus(shipment.latest_status_category);
  const deliveredAgo = deliveredAgoLabel(shipment.delivered_at);
  const subLine = shipment.is_delivered
    ? `${fmtDateTime(shipment.delivered_at)}${deliveredAgo ? ` · ${deliveredAgo}` : ''}`
    : shipment.out_for_delivery_at
      ? `Out for delivery · ${fmtDateTime(shipment.out_for_delivery_at)}`
      : null;
  const carrierEvents = carrierEventsToTimeline(shipment.events);
  const showEventsRail = !stationCompact || carrierEvents.length > 0;
  const showHero = parts === 'all' || parts === 'hero';
  const showEvents = parts === 'all' || parts === 'events';

  return (
    <div>
      {showHero ? (
        <div className={`rounded-xl border p-3 ${tone.wrap} ${showEvents && parts === 'all' ? 'mb-3' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-role-eyebrow text-text-soft">
                <span>{shortCarrier(shipment.carrier) || shipment.carrier || 'Carrier'}</span>
                {shipment.tracking_number ? (
                  <>
                    <span aria-hidden>·</span>
                    <TrackingChip
                      value={shipment.tracking_number}
                      display={getLast8(shipment.tracking_number)}
                      dense
                    />
                  </>
                ) : null}
              </div>
              <div className={`mt-1 flex items-center gap-2 text-base font-semibold ${tone.status}`}>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
                {headline}
              </div>
              {subLine ? (
                <div className="mt-1 text-role-caption font-semibold text-text-muted">{subLine}</div>
              ) : null}
              <div className="mt-0.5 text-role-eyebrow font-semibold text-text-faint">
                Last checked {fmtDateTime(shipment.last_checked_at)}
              </div>
            </div>
            <HoverTooltip label="Force a fresh poll against the carrier API" asChild>
              <Button
                variant="brand"
                size="sm"
                icon={<RefreshCw />}
                loading={repolling}
                onClick={() => void repoll()}
                ariaLabel="Force a fresh poll against the carrier API"
                className="h-7 shrink-0 bg-none bg-surface-inverse px-2 text-white hover:bg-surface-inverse-hover"
              >
                {repolling ? 'Polling…' : 'Re-poll'}
              </Button>
            </HoverTooltip>
          </div>
        </div>
      ) : null}

      {showEvents ? (
        showEventsRail ? (
          <div>
            {parts === 'all' ? (
              <h3 className={`mb-2 ${sectionLabel}`}>Recent carrier events</h3>
            ) : null}
            <EventTimeline
              items={carrierEvents}
              emptyMessage="No carrier events yet."
              density={stationCompact ? 'compact' : 'comfortable'}
              metaTrail={stationCompact}
            />
          </div>
        ) : (
          <p className="px-0.5 text-role-micro font-medium text-text-faint">
            No carrier event detail yet.
          </p>
        )
      ) : null}
    </div>
  );
}
