import type { OperationalStateSpec } from './state';

/** Lifecycle states — the one meaning, code, word and colour of each outbound lifecycle state, on every platform. */
export type LifecycleIcon = 'circle-dot' | 'check' | 'package-search' | 'alarm-clock' | 'package' | 'package-x' | 'truck' | 'circle-pause';

export interface LifecycleSpec extends OperationalStateSpec {
  icon: LifecycleIcon;
}

export const LIFECYCLE = {
  // Nobody has picked it yet — owner 2026-09-28: the WMS "awaiting pick" state,
  // named for the floor verb (To pick) and grey, because nothing has happened.
  toPick: { tone: 'neutral', code: 'TPK', label: 'To pick', icon: 'circle-dot' },
  // Picked (pick scan or serial taken), not packed yet — owner 2026-09-28: a
  // picked order no longer reads "Ready" like one nobody has touched, and the
  // picker's stage wears blue so it never reads as the packer's purple.
  picked: { tone: 'info', code: 'PIK', label: 'Picked', icon: 'package-search' },
  urgent: { tone: 'warning', code: 'URG', label: 'Urgent', icon: 'alarm-clock' },
  packed: { tone: 'fulfillment', code: 'PKD', label: 'Packed', icon: 'package' },
  outOfStock: { tone: 'danger', code: 'OOS', label: 'Out of stock', icon: 'package-x', hatched: true },
  shipped: { tone: 'success', code: 'SHP', label: 'Shipped', icon: 'truck' },
  // A floor-minted placeholder SKU (`TMP-…`) waiting to be paired to its real
  // Zoho item — stock that exists but cannot be sold or picked by name yet.
  onHold: { tone: 'warning', code: 'HLD', label: 'On hold', icon: 'circle-pause' },
} as const satisfies Record<string, LifecycleSpec>;

export type LifecycleState = keyof typeof LIFECYCLE;

export const LIFECYCLE_STATES = Object.keys(LIFECYCLE) as LifecycleState[];
