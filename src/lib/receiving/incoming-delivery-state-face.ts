/**
 * Incoming delivery-state presentation SoT — short grid labels + long tile titles.
 *
 * Grid icons (`ReceivingDeliveryStateIcon` cluster) and sidebar hunt tiles
 * ({@link TILES}) must not drift into parallel vocabularies. Icons, short
 * hover tips, tile labels, and long filter-education titles live here once.
 *
 * Dependency-light (icons + types only) so both client components and any
 * future server copy can import without dragging UI.
 */

import type { ComponentType } from 'react';
import {
  AlertTriangle,
  Clock,
  Hash,
  Inbox,
  Lock,
  MapPin,
  Package,
  PackageOpen,
  Truck,
  Unlink,
} from '@/components/Icons';
import type { IncomingDeliveryState, IncomingSummary } from '@/components/sidebar/receiving/incoming/incoming-summary-types';

type IncomingDeliveryStateFace = {
  state: IncomingDeliveryState;
  /** Compact grid hover tip — one short line. */
  tip: string;
  /** Icon tone class for the grid glyph. */
  iconTone: string;
  Icon: ComponentType<{ className?: string }>;
  /** Sidebar tile label (can use · separators). */
  tileLabel: string;
  /** Sidebar summary count key. */
  summaryKey: keyof IncomingSummary;
  tileTone: 'rose' | 'amber' | 'blue' | 'gray' | 'orange' | 'violet' | 'red';
  /**
   * Long filter-education title for the hunt tile tooltip / aria-description.
   * Intentionally verbose — lane altitude, not a grid cell.
   */
  tileTitle: string;
};

/**
 * Faceted delivery states shown as grid icons and (mostly) as hunt tiles.
 * Order here is not tile order — {@link INCOMING_HUNT_TILE_ORDER} owns that.
 */
export const INCOMING_DELIVERY_STATE_FACE: Record<IncomingDeliveryState, IncomingDeliveryStateFace> = {
  DELIVERED_UNOPENED: {
    state: 'DELIVERED_UNOPENED',
    tip: 'Delivered — not scanned',
    iconTone: 'text-rose-600',
    Icon: Inbox,
    tileLabel: 'Delivered · not scanned',
    summaryKey: 'delivered_unopened',
    tileTone: 'rose',
    tileTitle:
      'Carrier marked the box delivered AND no operator has scanned the tracking# at the receiving station yet (no receiving_scans row). Physically here, untouched — top priority. Age bands (<24h / 24–48h / >48h) drive burn-down; >48h needs claims attention.',
  },
  DELIVERED_NOT_UNBOXED: {
    state: 'DELIVERED_NOT_UNBOXED',
    tip: 'Delivered — not unboxed',
    iconTone: 'text-rose-600',
    Icon: PackageOpen,
    tileLabel: 'Delivered · not unboxed',
    summaryKey: 'delivered_not_unboxed',
    tileTone: 'rose',
    tileTitle:
      'Carrier marked the box delivered and nothing has been unboxed against it (0 received, no unboxed_at) — this is BROADER than "not scanned": it also catches boxes that were checked in at the dock and then stalled mid-unbox. A 48h+ marker flags dwell past the dock-to-stock target; eBay purchases additionally show a CLAIM countdown, because their item-not-received window closes 30 days after delivery whether or not anyone looks.',
  },
  ARRIVING_TODAY: {
    state: 'ARRIVING_TODAY',
    tip: 'Arriving today',
    iconTone: 'text-amber-600',
    Icon: Truck,
    tileLabel: 'Arriving today',
    summaryKey: 'arriving_today',
    tileTone: 'amber',
    tileTitle: 'Carrier currently reports "out for delivery".',
  },
  STALLED: {
    state: 'STALLED',
    tip: 'Stalled — no movement',
    iconTone: 'text-orange-600',
    Icon: AlertTriangle,
    tileLabel: 'Stalled',
    summaryKey: 'stalled',
    tileTone: 'orange',
    tileTitle:
      'Carrier-reported exception OR no scan in >72h while still mid-route. Catch these before vendors do.',
  },
  WRONG_DESTINATION: {
    state: 'WRONG_DESTINATION',
    tip: 'Wrong destination',
    iconTone: 'text-red-600',
    Icon: MapPin,
    tileLabel: 'Wrong destination',
    summaryKey: 'wrong_destination',
    tileTone: 'red',
    tileTitle:
      'Carrier delivered event postal code does not match the warehouse ship-from ZIP — possible mis-ship by the seller.',
  },
  IN_TRANSIT: {
    state: 'IN_TRANSIT',
    tip: 'In transit',
    iconTone: 'text-blue-600',
    Icon: MapPin,
    tileLabel: 'In transit',
    summaryKey: 'in_transit',
    tileTone: 'blue',
    tileTitle: 'Label created, accepted, or in transit (carrier-side).',
  },
  PENDING_CARRIER: {
    state: 'PENDING_CARRIER',
    tip: 'Awaiting carrier pickup',
    iconTone: 'text-sky-500',
    Icon: Clock,
    tileLabel: 'Pending carrier',
    summaryKey: 'pending_carrier',
    tileTone: 'gray',
    tileTitle:
      'Tracking# is registered with a known carrier, but the carrier sync has not returned a status yet (UNKNOWN / NULL). USPS shipments often land here while the sync adapter is rate-limited.',
  },
  TRACKING_UNAVAILABLE: {
    state: 'TRACKING_UNAVAILABLE',
    tip: 'Tracking blocked',
    iconTone: 'text-violet-600',
    Icon: Lock,
    tileLabel: 'Tracking unavailable',
    summaryKey: 'tracking_unavailable',
    tileTone: 'violet',
    tileTitle:
      'The carrier is refusing tracking requests for these (e.g. USPS access-control 403 while the IP Agreement is pending). Delivered status is unobtainable until access clears — not "not delivered".',
  },
  CARRIER_MISMATCH: {
    state: 'CARRIER_MISMATCH',
    tip: 'Carrier mismatch',
    iconTone: 'text-red-600',
    Icon: Unlink,
    tileLabel: 'Carrier mismatch',
    summaryKey: 'carrier_mismatch',
    tileTone: 'red',
    tileTitle:
      'The carrier and tracking# don’t match: the number matched no known carrier, or the carrier API has no record of it (not-found / invalid). These never resolve on their own — fix the tracking# or reassign the carrier.',
  },
  AWAITING_TRACKING: {
    state: 'AWAITING_TRACKING',
    tip: 'No tracking number',
    iconTone: 'text-text-faint',
    Icon: Hash,
    tileLabel: 'Awaiting tracking #',
    summaryKey: 'awaiting_tracking',
    tileTone: 'gray',
    tileTitle:
      'No tracking# registered at all — vendor has not shipped, or the PO `reference_number` field is empty upstream.',
  },
};

/** Hunt-strip order — "All issued" is prepended by the tile module. */
export const INCOMING_HUNT_TILE_ORDER: readonly IncomingDeliveryState[] = [
  'DELIVERED_UNOPENED',
  'DELIVERED_NOT_UNBOXED',
  'ARRIVING_TODAY',
  'STALLED',
  'WRONG_DESTINATION',
  'IN_TRANSIT',
  'PENDING_CARRIER',
  'TRACKING_UNAVAILABLE',
  'CARRIER_MISMATCH',
  'AWAITING_TRACKING',
] as const;

/** Tile icons can differ from the grid glyph (e.g. delivered-unopened uses AlertTriangle in the strip). */
export const INCOMING_HUNT_TILE_ICON: Partial<
  Record<IncomingDeliveryState, ComponentType<{ className?: string }>>
> = {
  DELIVERED_UNOPENED: AlertTriangle,
  TRACKING_UNAVAILABLE: AlertTriangle,
  WRONG_DESTINATION: Unlink,
  IN_TRANSIT: Truck,
};

export function incomingDeliveryStateFace(
  state: string | null | undefined,
): IncomingDeliveryStateFace | undefined {
  if (!state) return undefined;
  return INCOMING_DELIVERY_STATE_FACE[state as IncomingDeliveryState];
}

/** "All issued" tile — not a delivery_state facet. */
export const INCOMING_ALL_ISSUED_TILE = {
  state: null as null,
  label: 'All issued',
  key: 'issued' as const satisfies keyof IncomingSummary,
  tone: 'slate' as const,
  icon: Package,
  title: 'Every PO issued upstream and not yet received locally.',
};
