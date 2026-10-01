'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  getReadyWorkspaceTabFromSearch,
  normalizeReadyWorkspaceTabParams,
  type ReadyWorkspaceTab,
} from '@/utils/ready-workspace-state';
import { SHIPPING_PATH } from '@/lib/outbound/route-contract';

/** URL SoT for Ready disposition facets on `/shipping/fba?fbaMode=ready` (`?rtab=`). */
export function useReadyWorkspaceTab() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const readyTab = getReadyWorkspaceTabFromSearch(searchParams);

  const setReadyTab = useCallback(
    (nextTab: ReadyWorkspaceTab) => {
      const params = new URLSearchParams(searchParams.toString());
      normalizeReadyWorkspaceTabParams(params, nextTab);
      const qs = params.toString();
      const base = pathname || SHIPPING_PATH;
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { readyTab, setReadyTab };
}
