'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FulfillmentState } from '@/lib/unshipped-state';

/**
 * The one hook that owns the To Ship / Shipping Pending board's `?ustatus`
 * click-to-filter — read the lit lane, toggle PENDING | TESTED | BLOCKED.
 * Toolbar exact filters, keyboard hotkeys, and the attention KPI strips all
 * drive the SAME URL param through here (or the sibling actions in
 * OutboundFilterStrip), so a filter set from any surface lights the others.
 *
 * Monitor filter-only (contextual-display.md): throwaway URL param, never a
 * durable selection. Setting a lane clears coarse `?stage` and `?attention`
 * so the board collapses to one honest swimlane.
 */

function parseUstatus(raw: string | null): FulfillmentState | null {
  const v = String(raw || '').trim().toUpperCase();
  if (v === 'PENDING' || v === 'TESTED' || v === 'BLOCKED') return v;
  return null;
}

export function useToShipStatusFilter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const active = parseUstatus(searchParams.get('ustatus'));

  const replaceParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutator(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname || '/dashboard'}?${qs}` : pathname || '/dashboard', {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  const toggle = useCallback(
    (state: FulfillmentState) => {
      replaceParams((p) => {
        if (p.get('ustatus') === state) p.delete('ustatus');
        else {
          p.set('ustatus', state);
          p.delete('stage');
          p.delete('attention');
        }
      });
    },
    [replaceParams],
  );

  const clear = useCallback(() => {
    replaceParams((p) => {
      p.delete('ustatus');
      p.delete('stage');
      p.delete('attention');
    });
  }, [replaceParams]);

  return { active, toggle, clear };
}
