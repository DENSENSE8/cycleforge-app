'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  getTestingWorkspaceTabFromSearch,
  normalizeTestingWorkspaceTabParams,
  type TestingWorkspaceTab,
} from '@/utils/testing-workspace-state';

/** URL SoT for the Testing workbench tabs nested under `?view=testing`. */
export function useTestingWorkspaceTab() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const testTab = getTestingWorkspaceTabFromSearch(searchParams);

  const setTestTab = useCallback(
    (nextTab: TestingWorkspaceTab) => {
      const params = new URLSearchParams(searchParams.toString());
      normalizeTestingWorkspaceTabParams(params, nextTab);
      const qs = params.toString();
      const base = pathname || '/test';
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { testTab, setTestTab };
}
