'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAllStationLists } from '@/lib/queries/station-cache-patch';

/** `useStationReconnectSync` — the reconnect half of the station incremental-sync model (station-table-unification-plan §7.4). */
export function useStationReconnectSync(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const onOnline = () => invalidateAllStationLists(queryClient);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [queryClient]);
}
