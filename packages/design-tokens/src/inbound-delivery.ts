import type { OperationalStateSpec } from './state';

/**
 * Carrier-facing delivery states for inbound purchases. These are operational
 * states in their own right; they must never be translated into the outbound
 * lifecycle vocabulary just to fit a row component.
 */
export const INBOUND_DELIVERY = {
  DELIVERED_UNOPENED: {
    code: 'DSC',
    label: 'Delivered · not scanned',
    tone: 'danger',
    icon: 'inbox',
  },
  DELIVERED_NOT_UNBOXED: {
    code: 'DUB',
    label: 'Delivered · not unboxed',
    tone: 'danger',
    icon: 'package-open',
  },
  ARRIVING_TODAY: {
    code: 'TOD',
    label: 'Arriving today',
    tone: 'warning',
    icon: 'truck',
  },
  STALLED: {
    code: 'STL',
    label: 'Stalled',
    tone: 'warning',
    icon: 'alarm-clock',
  },
  IN_TRANSIT: {
    code: 'TRN',
    label: 'In transit',
    tone: 'info',
    icon: 'map-pin',
  },
  TRACKING_UNAVAILABLE: {
    code: 'BLK',
    label: 'Tracking unavailable',
    tone: 'danger',
    icon: 'lock',
  },
  PENDING_CARRIER: {
    code: 'PND',
    label: 'Pending carrier',
    tone: 'info',
    icon: 'clock',
  },
  CARRIER_MISMATCH: {
    code: 'CAR',
    label: 'Carrier mismatch',
    tone: 'danger',
    icon: 'unlink',
  },
  AWAITING_TRACKING: {
    code: 'NTR',
    label: 'Awaiting tracking',
    tone: 'warning',
    icon: 'hash',
  },
  WRONG_DESTINATION: {
    code: 'DST',
    label: 'Wrong destination',
    tone: 'danger',
    icon: 'map-pin',
  },
  RECEIVED: {
    code: 'RCV',
    label: 'Received',
    tone: 'success',
    icon: 'package-open',
  },
  UNKNOWN: {
    code: 'UNK',
    label: 'Unknown',
    tone: 'warning',
    icon: 'circle-help',
  },
} as const satisfies Record<string, OperationalStateSpec>;

export type InboundDeliveryState = keyof typeof INBOUND_DELIVERY;

export const INBOUND_DELIVERY_STATES = Object.keys(INBOUND_DELIVERY) as InboundDeliveryState[];
