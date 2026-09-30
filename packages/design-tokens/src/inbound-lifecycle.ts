import type { OperationalStateSpec } from './state';

/**
 * The inbound floor ladder — Ordered → Docked → Unboxed → Graded → Tested →
 * Put away — one meaning, code, word and colour per step on every platform
 * (owner 2026-09-29: the inbound record's steps wear colour the way the
 * outbound Fulfillment ladder does). Unboxed IS received: there is no
 * separate Received step. A sibling of the outbound `LIFECYCLE`, never an
 * alias of it — an inbound step must not widen the outbound order state.
 */
export const INBOUND_LIFECYCLE = {
  // The purchase exists (PO placed / row imported) — the first thing that
  // happened, in the first-action blue, like the outbound "Picked".
  ordered: { tone: 'info', code: 'ORD', label: 'Ordered', icon: 'file-text' },
  // The carrier handed it over at our door.
  docked: { tone: 'info', code: 'DCK', label: 'Docked', icon: 'door-open' },
  // Opened and counted in — the receipt. Blue, never purple: purple is
  // reserved for packing (owner 2026-09-29).
  unboxed: { tone: 'info', code: 'UBX', label: 'Unboxed', icon: 'package-open' },
  // Condition graded — inspection, the QC ink.
  graded: { tone: 'warning', code: 'GRD', label: 'Graded', icon: 'star' },
  tested: { tone: 'warning', code: 'TST', label: 'Tested', icon: 'shield-check' },
  // On a shelf and sellable — the terminal success, like "Shipped".
  putAway: { tone: 'success', code: 'PUT', label: 'Put away', icon: 'warehouse' },
} as const satisfies Record<string, OperationalStateSpec>;

export type InboundLifecycleState = keyof typeof INBOUND_LIFECYCLE;

export const INBOUND_LIFECYCLE_STATES = Object.keys(INBOUND_LIFECYCLE) as InboundLifecycleState[];
