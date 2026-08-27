'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  getLabelsWorkspaceTabFromSearch,
  normalizeLabelsWorkspaceTabParams,
  type LabelsWorkspaceTab,
} from '@/utils/labels-workspace-state';
import { SHIPPING_PATH } from '@/components/outbound/outbound-sidebar-shared';

/**
 * URL SoT for Labels-station workspace tabs on `/shipping` (`?ltab=`).
 * Does not touch the sidebar `?mode=` (Labels / Ready / FBA / Scan-out).
 */
export function useLabelsWorkspaceTab() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const labelsTab = getLabelsWorkspaceTabFromSearch(searchParams);

  const setLabelsTab = useCallback(
    (nextTab: LabelsWorkspaceTab) => {
      const params = new URLSearchParams(searchParams.toString());
      normalizeLabelsWorkspaceTabParams(params, nextTab);
      const qs = params.toString();
      const base = pathname || SHIPPING_PATH;
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { labelsTab, setLabelsTab };
}
