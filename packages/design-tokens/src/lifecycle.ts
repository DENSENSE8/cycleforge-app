import type { OperationalStateSpec } from './state';

/**
 * Lifecycle states — the one meaning, code, word and colour of each outbound
 * lifecycle state, on every platform. A surface that colours a lifecycle
 * state reads its `tone` here and resolves the colour through STATE_TONES
 * (web: the tone's theme-registry classes; iOS: `DesignTokens.State`); it
 * never picks a colour for the state itself.
 *
 *   code   3-letter mono code on industrial rows (read aloud as `label`)
 *   label  the full word
 *   tone   the functional state colour (`STATE_TONES` key)
 *   icon   the shape drawn before the code (Lucide name; iOS maps it to an
 *          SF Symbol) — the second carrier after colour, so a state reads by
 *          shape for colour-blind staff and at a glance down a long list
 *
 * Packed is `fulfillment` (purple) and shipped is `success` (green) —
 * everywhere, with no per-surface exceptions.
 */
export type LifecycleIcon = 'circle-dot' | 'alarm-clock' | 'package' | 'package-x' | 'truck' | 'circle-pause';

export interface LifecycleSpec extends OperationalStateSpec {
  icon: LifecycleIcon;
}

export const LIFECYCLE = {
  ready: { tone: 'info', code: 'RDY', label: 'Ready', icon: 'circle-dot' },
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
