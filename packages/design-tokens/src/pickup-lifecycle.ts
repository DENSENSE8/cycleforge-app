import type { OperationalStateSpec } from './state';

/**
 * The local-pickup ladder — Ordered → Collected → Unboxed → Graded → Tested →
 * Put away — one meaning, code, word and colour per step on every platform
 * (owner 2026-09-29). A pickup is a purchase we fetch ourselves: its external
 * half is the pickup, not a carrier, so "Collected" stands where the inbound
 * ladder has "Docked". A sibling of `INBOUND_LIFECYCLE`, never an alias.
 */
export const PICKUP_LIFECYCLE = {
  // The purchase exists (paperwork imported / order keyed) — first-action blue.
  ordered: { tone: 'info', code: 'ORD', label: 'Ordered', icon: 'file-text' },
  // We collected the goods from the seller on the pickup date.
  collected: { tone: 'info', code: 'COL', label: 'Collected', icon: 'map-pin' },
  // Opened and checked in — a condition grade is its evidence.
  unboxed: { tone: 'info', code: 'UBX', label: 'Unboxed', icon: 'package-open' },
  // Condition graded — inspection, the QC ink.
  graded: { tone: 'warning', code: 'GRD', label: 'Graded', icon: 'star' },
  tested: { tone: 'warning', code: 'TST', label: 'Tested', icon: 'shield-check' },
  // On a shelf and sellable — the terminal success.
  putAway: { tone: 'success', code: 'PUT', label: 'Put away', icon: 'warehouse' },
} as const satisfies Record<string, OperationalStateSpec>;

export type PickupLifecycleState = keyof typeof PICKUP_LIFECYCLE;

export const PICKUP_LIFECYCLE_STATES = Object.keys(PICKUP_LIFECYCLE) as PickupLifecycleState[];
