'use client';

import {
  incomingDeliveryStateFace,
} from '@/lib/receiving/incoming-delivery-state-face';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';

/** Visible chip in the 4.75rem Status track — full phrase lives in the tooltip. */
const UNVERIFIED_TRACKING_LABEL = 'Unv.';

const UNVERIFIED_TRACKING_TIP = 'Tracking on file — carrier hasn’t confirmed yet';

const UNVERIFIED_CHIP_CLASS = 'min-w-0 truncate text-role-eyebrow text-amber-700';

/**
 * The Unverified chip is redundant when delivery_state already means the carrier
 * has not responded (PENDING_CARRIER).
 */
function shouldShowUnverifiedChip(
  deliveryState: string | null | undefined,
  sellerReported: boolean,
): boolean {
  return sellerReported && deliveryState !== 'PENDING_CARRIER';
}

/** Tooltip when Incoming status shows icon + Unverified chip together. */
function incomingStatusTooltip(
  deliveryState: string | null | undefined,
  sellerReported: boolean,
): string | null {
  const face = incomingDeliveryStateFace(deliveryState);
  if (!sellerReported) return face?.tip ?? null;
  if (!shouldShowUnverifiedChip(deliveryState, sellerReported)) {
    return UNVERIFIED_TRACKING_TIP;
  }
  if (deliveryState === 'CARRIER_MISMATCH') {
    return 'Verify tracking — carrier doesn’t recognize this number';
  }
  if (face) return `${face.tip} — not verified with carrier`;
  return UNVERIFIED_TRACKING_TIP;
}

function carrierConfirmedTip(args: {
  baseTip: string;
  city?: string | null;
  postal?: string | null;
  eventAt?: string | null;
  lastCheckedAt?: string | null;
}): string {
  const place = [args.city?.trim(), args.postal?.trim()].filter(Boolean).join(' ');
  const parts = [args.baseTip];
  if (place) parts.push(`last scan ${place}`);
  if (args.eventAt?.trim()) parts.push(args.eventAt.trim());
  if (args.lastCheckedAt?.trim()) parts.push(`synced ${args.lastCheckedAt.trim()}`);
  return parts.join(' · ');
}

/**
 * Faceted receiving delivery state → a single compact icon with a hover/a11y
 * label. Labels come from {@link incomingDeliveryStateFace} — same vocabulary
 * as the Incoming hunt tiles.
 */
function DeliveryStateIcon({
  state,
  className,
  suppressTooltip = false,
  tooltipLabel,
}: {
  state: string | null | undefined;
  className?: string;
  /** Render icon only — parent supplies the hover label (e.g. combined Unverified cluster). */
  suppressTooltip?: boolean;
  /** Override the default delivery-state tooltip (e.g. unverified-only pending carrier). */
  tooltipLabel?: string;
}) {
  const face = incomingDeliveryStateFace(state);
  if (!face) return null;
  const { Icon, iconTone, tip: defaultLabel } = face;
  const label = tooltipLabel ?? defaultLabel;

  const icon = <Icon className={cn('h-3.5 w-3.5 shrink-0', iconTone)} aria-hidden />;

  if (suppressTooltip) {
    return (
      <span className={cn('inline-flex items-center', className)} aria-hidden>
        {icon}
      </span>
    );
  }

  return (
    <HoverTooltip label={label} focusable={false} className={cn('inline-flex cursor-default items-center', className)}>
      <span aria-label={label}>{icon}</span>
    </HoverTooltip>
  );
}

type IncomingCarrierEventMeta = {
  city?: string | null;
  postal?: string | null;
  eventAt?: string | null;
  lastCheckedAt?: string | null;
};

/** Incoming delivery icon + optional Unverified chip / carrier city — one tooltip, shared between the grid status cell and dashboard order… */
export function IncomingTrackingStatusCluster({
  deliveryState,
  sellerReported,
  labelClassName = UNVERIFIED_CHIP_CLASS,
  carrierEvent,
  showCarrierCity = false,
}: {
  deliveryState: string | null | undefined;
  sellerReported: boolean;
  labelClassName?: string;
  /** Carrier-confirmed last-event facts for a combined tip (and optional city chip). */
  carrierEvent?: IncomingCarrierEventMeta | null;
  /** When true, render city/postal text beside the icon (list rows, not the grid). */
  showCarrierCity?: boolean;
}) {
  const hasState = Boolean(deliveryState);
  const showChip = shouldShowUnverifiedChip(deliveryState, sellerReported);
  const face = incomingDeliveryStateFace(deliveryState);
  const city = carrierEvent?.city?.trim() || '';
  const postal = carrierEvent?.postal?.trim() || '';
  const showCity = Boolean(showCarrierCity && city && !sellerReported);

  if (hasState && sellerReported && showChip) {
    const tip = incomingStatusTooltip(deliveryState, true)!;
    return (
      <HoverTooltip label={tip}>
        <span className="inline-flex min-w-0 max-w-full items-center gap-1">
          <DeliveryStateIcon state={deliveryState} suppressTooltip />
          <span className={labelClassName} aria-label={tip}>
            {UNVERIFIED_TRACKING_LABEL}
          </span>
        </span>
      </HoverTooltip>
    );
  }

  if (hasState) {
    const baseTip = sellerReported
      ? UNVERIFIED_TRACKING_TIP
      : face?.tip ?? '';
    const tip =
      !sellerReported && (city || carrierEvent?.eventAt || carrierEvent?.lastCheckedAt)
        ? carrierConfirmedTip({
            baseTip,
            city,
            postal,
            eventAt: carrierEvent?.eventAt,
            lastCheckedAt: carrierEvent?.lastCheckedAt,
          })
        : baseTip || undefined;

    if (showCity) {
      return (
        <HoverTooltip label={tip ?? baseTip}>
          <span className="inline-flex min-w-0 max-w-full items-center gap-1">
            <DeliveryStateIcon state={deliveryState} suppressTooltip />
            <span className="hidden min-w-0 truncate text-role-eyebrow font-semibold text-text-faint sm:inline">
              {city}
              {postal ? ` ${postal}` : ''}
            </span>
          </span>
        </HoverTooltip>
      );
    }

    return (
      <DeliveryStateIcon
        state={deliveryState}
        tooltipLabel={tip}
      />
    );
  }

  if (sellerReported) {
    return (
      <HoverTooltip label={UNVERIFIED_TRACKING_TIP}>
        <span className={labelClassName} aria-label={UNVERIFIED_TRACKING_TIP}>
          {UNVERIFIED_TRACKING_LABEL}
        </span>
      </HoverTooltip>
    );
  }

  return null;
}
