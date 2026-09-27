'use client';

import { useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import {
  getShippingWorkspaceTabFromSearch,
  normalizeShippingWorkspaceTabParams,
  type ShippingWorkspaceTab,
} from '@/utils/shipping-workspace-state';

/** URL SoT for the Picker desk workspace tabs on `/pick` (`?ship=`). */
export function useShippingWorkspaceTab() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const shipTab = getShippingWorkspaceTabFromSearch(searchParams);

  const setShipTab = useCallback(
    (nextTab: ShippingWorkspaceTab) => {
      const params = readLiveSearchParams(searchParams.toString());
      normalizeShippingWorkspaceTabParams(params, nextTab);
      const qs = params.toString();
      const base = pathname || '/pick';
      window.history.replaceState(window.history.state, '', qs ? `${base}?${qs}` : base);
    },
    [pathname, searchParams],
  );

  return { shipTab, setShipTab };
}
