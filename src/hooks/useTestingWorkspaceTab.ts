'use client';

import { useSearchParams } from 'next/navigation';
import { getTestingWorkspaceTabFromSearch } from '@/utils/testing-workspace-state';

/** URL SoT for the Quality Control workbench view on `/test` (`?testTab=`). */
export function useTestingWorkspaceTab() {
  const searchParams = useSearchParams();
  return { testTab: getTestingWorkspaceTabFromSearch(searchParams) };
}
