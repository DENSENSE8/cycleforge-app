import type { StateName } from './state';

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
 *
 * Packed is `fulfillment` (purple) and shipped is `success` (green) —
 * everywhere, with no per-surface exceptions.
 */
export interface LifecycleSpec {
  code: string;
  label: string;
  tone: StateName;
}

export const LIFECYCLE = {
  ready: { tone: 'info', code: 'RDY', label: 'Ready' },
  urgent: { tone: 'warning', code: 'URG', label: 'Urgent' },
  packed: { tone: 'fulfillment', code: 'PKD', label: 'Packed' },
  outOfStock: { tone: 'danger', code: 'OOS', label: 'Out of stock' },
  shipped: { tone: 'success', code: 'SHP', label: 'Shipped' },
  // A floor-minted placeholder SKU (`TMP-…`) waiting to be paired to its real
  // Zoho item — stock that exists but cannot be sold or picked by name yet.
  onHold: { tone: 'warning', code: 'HLD', label: 'On hold' },
} as const satisfies Record<string, LifecycleSpec>;

export type LifecycleState = keyof typeof LIFECYCLE;

export const LIFECYCLE_STATES = Object.keys(LIFECYCLE) as LifecycleState[];
