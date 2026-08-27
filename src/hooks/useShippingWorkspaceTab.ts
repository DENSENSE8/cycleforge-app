'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  getShippingWorkspaceTabFromSearch,
  normalizeShippingWorkspaceTabParams,
  type ShippingWorkspaceTab,
} from '@/utils/shipping-workspace-state';

/**
 * URL SoT for Shipping mode workspace tabs on `/test` (`?ship=`).
 * Does not touch top-level `?view=` (Shipping / Testing / History).
 */
export function useShippingWorkspaceTab() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const shipTab = getShippingWorkspaceTabFromSearch(searchParams);

  const setShipTab = useCallback(
    (nextTab: ShippingWorkspaceTab) => {
      const params = new URLSearchParams(searchParams.toString());
      normalizeShippingWorkspaceTabParams(params, nextTab);
      const qs = params.toString();
      const base = pathname || '/test';
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { shipTab, setShipTab };
}
