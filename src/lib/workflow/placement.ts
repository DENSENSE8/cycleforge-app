/** placement — the action layer that turns a decision node's SYMBOLIC placement directive into a concrete bin the guarded writer can move a… */

import type { OrgId } from '@/lib/tenancy/constants';
import type { DecisionPlacement } from './decision-eval';

/** A placement symbol resolved to a concrete, addressable bin. */
export interface ResolvedPlacement {
  binId: number;
  binName: string;
}

/** Why a placement could not be resolved to a bin (for the caller's degrade path). */
export type PlacementResolutionMiss =
  | 'no_directive' // the rule carried no `placement` symbol (route-only)
  | 'bin_not_found'; // the symbol didn't match any seeded location for this org

export type ResolvePlacementResult =
  | { resolved: true; bin: ResolvedPlacement }
  | { resolved: false; reason: PlacementResolutionMiss };

/** Injectable lookups (real `locations` repo by default; fakes in tests). */
export interface PlacementResolverDeps {
  findByBarcode: (barcode: string) => Promise<{ id: number; name: string } | null>;
  findByName: (name: string) => Promise<{ id: number; name: string } | null>;
}

// The real `locations` repo pulls in the eager drizzle/db client, so it is LAZY-imported inside the default deps — importing this module…
const defaultDeps: PlacementResolverDeps = {
  findByBarcode: async (barcode) => {
    const { findLocationByBarcode } = await import('@/lib/repositories/inventory/locations');
    return findLocationByBarcode(barcode);
  },
  findByName: async (name) => {
    const { findLocationByName } = await import('@/lib/repositories/inventory/locations');
    return findLocationByName(name);
  },
};

/** Resolve a `DecisionPlacement.placement` symbol to a concrete bin. */
export async function resolvePlacementBin(
  placement: DecisionPlacement | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- threaded for the forthcoming org-scoped lookup; see @param
  orgId: OrgId,
  deps: PlacementResolverDeps = defaultDeps,
): Promise<ResolvePlacementResult> {
  const symbol = placement?.placement?.trim();
  if (!symbol) return { resolved: false, reason: 'no_directive' };

  const loc = (await deps.findByBarcode(symbol)) ?? (await deps.findByName(symbol));
  if (!loc) return { resolved: false, reason: 'bin_not_found' };

  return { resolved: true, bin: { binId: loc.id, binName: loc.name } };
}
