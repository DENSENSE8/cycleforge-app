'use client';

/**
 * Bottom-anchored carton-list filter for the Triage sidebar (D1,
 * docs/receiving-triage-redesign-plan.md §0.6). Distinct from the scan band
 * pinned at the top (`TriageScanBand`, which resolves a tracking # via
 * `submitTrackingScan` and never filters) — this is a plain client-side filter
 * over the Triage/Prioritize/Unfound/Done lists, for "find a carton I already
 * scanned in" rather than "search Zoho for a PO to link" (that's `PoLinkTab`,
 * kept as-is per D1).
 *
 * URL-backed via `?triq=` (owned by `useReceivingMode`) so a filtered view
 * survives a refresh/deep-link — the gap the plan's D1 implementation note
 * flagged in the prior local-state-only `triageQuery`.
 *
 * Thin host over {@link TechRailSearchBar} (same row-dense band as MasterNav
 * and other station rails) — NOT the global header search (the app's only
 * search) — see sidebar-search-bar.guard.test.ts.
 */

import type { ReactNode } from 'react';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';

export function TriageCartonSearchBar({
  value,
  onChange,
  trailingSuffix,
}: {
  /** Current `?triq=` value (server/URL truth). */
  value: string;
  /** Debounced commit — writes `?triq=`. */
  onChange: (next: string) => void;
  /** Field-density facets after paste (Receiving recent-rail filter SoT). */
  trailingSuffix?: ReactNode;
}) {
  return (
    <TechRailSearchBar
      value={value}
      onChange={onChange}
      placeholder="Find a scanned carton…"
      trailingSuffix={trailingSuffix}
    />
  );
}
