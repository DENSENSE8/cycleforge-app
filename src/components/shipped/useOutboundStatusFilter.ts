'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { OutboundState } from '@/lib/outbound-state';

/**
 * The one hook that owns the shipped board's `?ostatus` click-to-filter — read
 * the lit state, toggle a state on/off. Both the toolbar {@link OutboundStatusLegend}
 * chips AND the Outbound KPI strip's donut arcs + throughput dials drive the SAME
 * URL param through here, so a filter set from either surface lights the others.
 *
 * Monitor filter-only (contextual-display.md): a throwaway URL param, never a
 * durable selection. EXCEPTION folds PROCESS_GAP the same way the board and legend
 * do (see `useShippedTableFilters`).
 */
export function useOutboundStatusFilter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const active = ((searchParams.get('ostatus') || '').trim().toUpperCase() || null) as OutboundState | null;

  const toggle = useCallback(
    (state: OutboundState) => {
      const params = new URLSearchParams(searchParams.toString());
      if (params.get('ostatus') === state) params.delete('ostatus');
      else params.set('ostatus', state);
      const qs = params.toString();
      router.replace(qs ? `${pathname || '/dashboard'}?${qs}` : pathname || '/dashboard', { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const clear = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('ostatus');
    const qs = params.toString();
    router.replace(qs ? `${pathname || '/dashboard'}?${qs}` : pathname || '/dashboard', { scroll: false });
  }, [router, pathname, searchParams]);

  return { active, toggle, clear };
}
