'use client';

import { useSearchParams } from 'next/navigation';
import { getTriageWorkspaceTabFromSearch } from '@/utils/triage-workspace-state';

/** URL SoT for the Triage workbench view (`?triview=` on `/triage`). */
export function useTriageWorkspaceTab() {
  const searchParams = useSearchParams();
  return { triageView: getTriageWorkspaceTabFromSearch(searchParams) };
}
