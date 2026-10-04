'use client';

/**
 * Client side of the arrival urgency shelves (`locations.arrival_priority_tier`):
 * the one read of which shelf carries which tier (GET
 * /api/receiving/arrival-shelves, read beside a location list) and the one
 * write (PATCH /api/locations/[barcode]/properties `arrivalPriorityTier`).
 */

import { useQuery } from '@tanstack/react-query';
import { qk } from '@/queries/keys';
import type { ArrivalShelf } from '@/lib/receiving/arrival-shelf-plan';
import { ARRIVAL_TIERS, arrivalTierLabel, type ArrivalTier } from '@/lib/receiving/arrival-tier';

export interface ArrivalShelfTiers {
  /** `locations.id` → tier (0 = most urgent). */
  tierById: Map<number, number>;
  /** Every active tiered shelf, most urgent tier first, then sort order — the server's order. */
  shelves: ArrivalShelf[];
}

export async function fetchArrivalShelfTiers(): Promise<ArrivalShelfTiers> {
  const res = await fetch('/api/receiving/arrival-shelves', { credentials: 'include', cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'Failed to load urgency shelves');
  const tierById = new Map<number, number>();
  const shelves: ArrivalShelf[] = [];
  for (const shelf of Array.isArray(body.shelves) ? body.shelves : []) {
    if (!Number.isInteger(shelf?.id) || !Number.isInteger(shelf?.tier)) continue;
    tierById.set(shelf.id, shelf.tier);
    // Server-authored ArrivalShelf — see readArrivalShelves.
    shelves.push(shelf as ArrivalShelf);
  }
  return { tierById, shelves };
}

/** Shares `qk.locationsAdmin.arrivalShelves()` with the desk's Manage tab, so a write on either refreshes both. */
export function useArrivalShelfTiers() {
  return useQuery<ArrivalShelfTiers>({
    queryKey: qk.locationsAdmin.arrivalShelves(),
    queryFn: fetchArrivalShelfTiers,
    staleTime: 30_000,
  });
}

/** Set (0..3) or clear (null) a shelf's arrival urgency. Resolves the saved tier; throws the route's message. */
export async function saveArrivalShelfTier(barcode: string, tier: ArrivalTier | null): Promise<ArrivalTier | null> {
  const res = await fetch(`/api/locations/${encodeURIComponent(barcode)}/properties`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arrivalPriorityTier: tier }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Could not save the urgency (${res.status})`);
  return tier;
}

export interface ArrivalTierChoice {
  /** `''` = not an arrival shelf. */
  value: '' | `${ArrivalTier}`;
  tier: ArrivalTier | null;
  label: string;
}

/** Every choice, most urgent first, then "Not an arrival shelf". */
export const ARRIVAL_TIER_CHOICES: readonly ArrivalTierChoice[] = [
  ...ARRIVAL_TIERS.map((tier) => ({ value: `${tier}` as const, tier, label: arrivalTierLabel(tier) })),
  { value: '', tier: null, label: 'Not an arrival shelf' },
];

/** Record-card tone of a tiered shelf: the most urgent reads hottest. */
export function arrivalTierTone(tier: number): 'bad' | 'warn' | 'neutral' | 'ok' {
  if (tier === 0) return 'bad';
  if (tier === 1) return 'warn';
  if (tier === 3) return 'ok';
  return 'neutral';
}
