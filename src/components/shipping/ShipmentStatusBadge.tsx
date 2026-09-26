'use client';

import { useMemo } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { AlertTriangle, Truck, Package, PackageCheck, RotateCcw, Clock } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { isStalled } from '@/lib/shipping/shipment-status';

export type ShipmentStatusCategory =
  | 'LABEL_CREATED'
  | 'ACCEPTED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'EXCEPTION'
  | 'RETURNED'
  | 'UNKNOWN';

export type CarrierCode = 'UPS' | 'USPS' | 'FEDEX';

interface ShipmentStatusBadgeProps {
  carrier?: CarrierCode | string | null;
  category?: ShipmentStatusCategory | string | null;
  description?: string | null;
  latestEventAt?: string | null;
  city?: string | null;
  state?: string | null;
  hasException?: boolean | null;
  isTerminal?: boolean | null;
  /** Hours since last event before non-terminal shipments count as stalled. Defaults to 72. */
  stallHours?: number;
  className?: string;
}

const CATEGORY_STYLE: Record<ShipmentStatusCategory, { cls: string; text: string; icon: React.FC<{ className?: string }>; label: string }> = {
  LABEL_CREATED:    { cls: 'bg-surface-sunken text-text-muted',       text: 'text-text-soft',    icon: Package,      label: 'label created' },
  ACCEPTED:         { cls: 'bg-surface-accent text-text-accent',   text: 'text-text-info',    icon: Truck,        label: 'accepted' },
  IN_TRANSIT:       { cls: 'bg-surface-accent text-text-accent',   text: 'text-text-info',    icon: Truck,        label: 'in transit' },
  OUT_FOR_DELIVERY: { cls: 'bg-surface-warning text-text-warning', text: 'text-text-warning', icon: Truck,        label: 'out for delivery' },
  DELIVERED:        { cls: 'bg-surface-success text-text-success', text: 'text-text-success', icon: PackageCheck, label: 'delivered' },
  EXCEPTION:        { cls: 'bg-surface-danger text-text-danger',   text: 'text-text-danger',  icon: AlertTriangle, label: 'exception' },
  RETURNED:         { cls: 'bg-surface-warning text-text-warning', text: 'text-text-warning', icon: RotateCcw,    label: 'returned' },
  UNKNOWN:          { cls: 'bg-surface-canvas text-text-soft',        text: 'text-text-faint',    icon: Clock,        label: 'unknown' },
};

function normalizeCategory(value: string | null | undefined): ShipmentStatusCategory {
  const upper = String(value ?? '').toUpperCase();
  return (upper in CATEGORY_STYLE ? upper : 'UNKNOWN') as ShipmentStatusCategory;
}

/** The stall rule is data, not paint: */

export function ShipmentStatusBadge({
  carrier,
  category,
  description,
  latestEventAt,
  city,
  state,
  hasException,
  isTerminal,
  stallHours = 72,
  className,
}: ShipmentStatusBadgeProps) {
  const normalizedCategory = normalizeCategory(category);
  const style = CATEGORY_STYLE[normalizedCategory];
  const Icon = style.icon;

  const stalled = useMemo(
    () => isStalled({ isTerminal, category: normalizedCategory, latestEventAt, stallHours }),
    [isTerminal, normalizedCategory, latestEventAt, stallHours],
  );

  const carrierLabel = carrier ? String(carrier).toUpperCase() : null;
  const relative = useMemo(() => {
    if (!latestEventAt) return null;
    const d = new Date(latestEventAt);
    if (!Number.isFinite(d.getTime())) return null;
    return formatDistanceToNowStrict(d, { addSuffix: true });
  }, [latestEventAt]);

  const loc = [city, state].filter(Boolean).join(', ');
  const exceptionShown = Boolean(hasException) || normalizedCategory === 'EXCEPTION' || normalizedCategory === 'RETURNED';

  return (
    <div className={`inline-flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      <HoverTooltip label={description ?? style.label} asChild>
        <span
          className={`inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-role-micro font-medium uppercase tracking-wide ${style.cls}`}
        >
          <Icon className="h-3 w-3" />
          {carrierLabel ? `${carrierLabel} · ` : ''}
          {style.label}
        </span>
      </HoverTooltip>

      {(exceptionShown || stalled) && (
        <HoverTooltip
          label={
            exceptionShown
              ? description || 'Carrier reported an exception'
              : `No carrier scan in ${stallHours}h+`
          }
          asChild
        >
          <span
            className="inline-flex items-center gap-1 rounded-none bg-fill-danger px-2 py-0.5 text-role-micro font-semibold uppercase tracking-wide text-text-inverse"
          >
            <AlertTriangle className="h-3 w-3" />
            {exceptionShown ? 'Exception' : 'Stalled'}
          </span>
        </HoverTooltip>
      )}

      {relative && (
        <HoverTooltip label={latestEventAt ?? ''} asChild>
          <span className="whitespace-nowrap text-role-caption text-text-soft">
            {relative}
            {loc ? ` · ${loc}` : ''}
          </span>
        </HoverTooltip>
      )}
    </div>
  );
}
