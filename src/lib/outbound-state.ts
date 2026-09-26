/** Outbound package state — the single source of truth for "where is this package in the pack → leave‑the‑building → carrier‑custody →… */

// The outbound stage vocabulary + derivation + custody predicates now live in the canonical `order-lifecycle.ts` projection (W2…
export {
  carrierHasCustody,
  hasLeftWarehouse,
  effectiveShipTime,
  resolveOutboundStage as deriveOutboundState,
} from '@/lib/order-lifecycle';
import type { OutboundStage, OutboundSignals } from '@/lib/order-lifecycle';
import { buildStateMeta } from '@/lib/labels/resolve';

/** The post‑dock outbound stage vocabulary. Canonical definition in `order-lifecycle.ts`. */
export type OutboundState = OutboundStage;
type OutboundStateInput = OutboundSignals;

interface OutboundStateMeta {
  label: string;
  /** One-line plain-English meaning — surfaced as the hover tooltip on dots + legend chips. */
  description: string;
  /** Tailwind classes for a compact pill (bg + text + ring). */
  pill: string;
  /** Tailwind bg class for a status dot. */
  dot: string;
}

// Dot colors are mutually distinct hues (In Custody indigo vs Orphan pink are deliberately far apart).
export const OUTBOUND_STATE_META = buildStateMeta('outbound') as Record<OutboundState, OutboundStateMeta>;

/** Fields the table/scan-out view attach to each record after derivation. */
export interface WithOutboundState {
  outboundState: OutboundState;
  /** Has the package physically left (scanned out or carrier has custody)? */
  hasLeft: boolean;
  /** Day-key time: ship_confirmed_at ?? packed_at. */
  effShipTime: string | null;
}
