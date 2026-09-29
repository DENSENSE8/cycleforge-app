'use client';

import { useSearchParams } from 'next/navigation';
import { getPackWorkspaceTabFromSearch } from '@/utils/pack-workspace-state';

/** URL SoT for the Pack workbench view (`?packview=` on `/pack`). */
export function usePackWorkspaceTab() {
  const searchParams = useSearchParams();
  return { packView: getPackWorkspaceTabFromSearch(searchParams) };
}
