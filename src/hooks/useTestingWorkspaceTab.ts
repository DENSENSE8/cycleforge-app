'use client';

import { useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import {
  getTestingWorkspaceTabFromSearch,
  normalizeTestingWorkspaceTabParams,
  type TestingWorkspaceTab,
} from '@/utils/testing-workspace-state';

/** URL SoT for the Quality Control workbench tabs on `/test` (`?testTab=`). */
export function useTestingWorkspaceTab() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const testTab = getTestingWorkspaceTabFromSearch(searchParams);

  const setTestTab = useCallback(
    (nextTab: TestingWorkspaceTab) => {
      const params = readLiveSearchParams(searchParams.toString());
      normalizeTestingWorkspaceTabParams(params, nextTab);
      const qs = params.toString();
      const base = pathname || '/test';
      window.history.replaceState(window.history.state, '', qs ? `${base}?${qs}` : base);
    },
    [pathname, searchParams],
  );

  return { testTab, setTestTab };
}
