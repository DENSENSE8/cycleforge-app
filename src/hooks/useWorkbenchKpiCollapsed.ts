'use client';

/**
 * Per-surface KPI Band 2 snap-collapse — reads/writes
 * `staff_preferences.kpiCollapsed[surfaceId]`. Default open (absent / false).
 *
 * JSONB merge is shallow at `kpiCollapsed`, so every write spreads the prior
 * map (same pitfall as `tableColumns`).
 *
 * Local state is the paint SoT after first hydrate. Re-applying `stored` on
 * every prefs cache write caused Hide/Show metrics to flash and snap back —
 * concurrent staff-preference mutations (`onSuccess` full replace) briefly
 * regress `kpiCollapsed` even when this surface's write is in flight.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  STAFF_PREFERENCES_QUERY_KEY,
  useStaffPreferences,
} from '@/hooks/useStaffPreferences';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import type { WorkbenchKpiSurfaceId } from '@/components/dashboard/workbench-kpi-collapse';

function readStoredCollapsed(
  prefs: StaffPreferences | undefined,
  surfaceId: WorkbenchKpiSurfaceId | null,
): boolean {
  if (surfaceId == null) return false;
  return prefs?.kpiCollapsed?.[surfaceId] === true;
}

/**
 * `surfaceId` may be `null` for a sheet with **no KPI band** (tabs + triage
 * only — Pickup, the Review family, Locations, …). The band is what owns the
 * collapse control, so a surface without one has no preference to read and
 * nothing that could write it; `null` keeps it inert rather than persisting a
 * key under a surface that has no band. Hooks cannot be called conditionally,
 * which is why this is a nullable parameter and not a conditional call site.
 */
export function useWorkbenchKpiCollapsed(surfaceId: WorkbenchKpiSurfaceId | null) {
  const { prefs, update, isLoading } = useStaffPreferences();
  const queryClient = useQueryClient();

  // Seed from cache when prefs already hydrated (in-app nav) — avoids a
  // one-frame open→closed flash for staffers who left the band collapsed.
  const [collapsed, setCollapsedLocal] = useState(() =>
    readStoredCollapsed(
      queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY),
      surfaceId,
    ),
  );
  const hydratedRef = useRef(
    queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) != null,
  );
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  useEffect(() => {
    if (isLoading || hydratedRef.current) return;
    hydratedRef.current = true;
    setCollapsedLocal(readStoredCollapsed(prefs, surfaceId));
  }, [isLoading, prefs, surfaceId]);

  const setCollapsed = useCallback(
    (next: boolean) => {
      if (surfaceId == null) return; // no band ⇒ no preference to persist
      setCollapsedLocal(next);
      collapsedRef.current = next;
      const prev =
        queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ??
        prefs ??
        {};
      const nextMap = { ...(prev.kpiCollapsed ?? {}), [surfaceId]: next };
      queryClient.setQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY, {
        ...prev,
        kpiCollapsed: nextMap,
      });
      update({ kpiCollapsed: nextMap });
    },
    [prefs, queryClient, surfaceId, update],
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsedRef.current);
  }, [setCollapsed]);

  return { collapsed, setCollapsed, toggleCollapsed, isLoading };
}
