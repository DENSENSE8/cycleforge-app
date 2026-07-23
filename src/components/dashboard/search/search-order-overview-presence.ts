/**
 * Presence helpers for Search order Overview — facts drive which cells/cards
 * mount. Deep tabs keep the full schema with teaching empties.
 */

import type { ReactNode } from 'react';

/** True when a fact value has nothing to show (null, empty string, blank). */
export function isSearchOrderFactEmpty(value: ReactNode): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

/** True when ship-by is a real instant that falls before created. */
export function isShipByBeforeCreated(
  shipBy: string | null | undefined,
  created: string | null | undefined,
): boolean {
  const shipMs = shipBy ? Date.parse(shipBy) : Number.NaN;
  const createdMs = created ? Date.parse(created) : Number.NaN;
  if (!Number.isFinite(shipMs) || !Number.isFinite(createdMs)) return false;
  return shipMs < createdMs;
}
