'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import {
  getTriageWorkspaceTabFromSearch,
  normalizeTriageWorkspaceTabParams,
  type TriageWorkspaceTab,
} from '@/utils/triage-workspace-state';

/** URL SoT for Triage workbench tabs (`?triview=` on `/triage`). */
export function useTriageWorkspaceTab() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const triageView = getTriageWorkspaceTabFromSearch(searchParams);

  const setTriageView = useCallback(
    (nextTab: TriageWorkspaceTab, opts?: { clearLine?: boolean }) => {
      if (nextTab === triageView) return;
      // Different list = drop the prior pick (mirrors useUnboxWorkspaceTab).
      if (opts?.clearLine !== false) {
        window.dispatchEvent(new CustomEvent('receiving-clear-line'));
      }
      const params = new URLSearchParams(searchParams.toString());
      normalizeTriageWorkspaceTabParams(params, nextTab);
      const qs = params.toString();
      const base = receivingSurfaceBasePath(pathname) || '/triage';
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams, triageView],
  );

  return { triageView, setTriageView };
}
