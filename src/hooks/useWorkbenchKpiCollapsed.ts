'use client';

/**
 * Per-surface KPI Band 2 snap-collapse — reads/writes
 * `staff_preferences.kpiCollapsed[surfaceId]`. Default open (absent / false).
 *
 * JSONB merge is shallow at `kpiCollapsed`, so every write spreads the prior
 * map (same pitfall as `tableColumns`).
 */

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  STAFF_PREFERENCES_QUERY_KEY,
  useStaffPreferences,
} from '@/hooks/useStaffPreferences';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import type { WorkbenchKpiSurfaceId } from '@/components/dashboard/workbench-kpi-collapse';

export function useWorkbenchKpiCollapsed(surfaceId: WorkbenchKpiSurfaceId) {
  const { prefs, update, isLoading } = useStaffPreferences();
  const queryClient = useQueryClient();
  const stored = prefs?.kpiCollapsed?.[surfaceId] === true;

  // Optimistic local mirror — default open while prefs hydrate (no flash-closed).
  const [collapsed, setCollapsedLocal] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    setCollapsedLocal(stored);
  }, [isLoading, stored]);

  const setCollapsed = useCallback(
    (next: boolean) => {
      setCollapsedLocal(next);
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

  return { collapsed, setCollapsed, isLoading };
}
