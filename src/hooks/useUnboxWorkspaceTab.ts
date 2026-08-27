'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import {
  getUnboxWorkspaceTabFromSearch,
  normalizeUnboxWorkspaceTabParams,
  type UnboxWorkspaceTab,
} from '@/utils/unbox-workspace-state';

/** URL SoT for Unbox workbench tabs (`?unboxview=` on `/unbox`). */
export function useUnboxWorkspaceTab() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const unboxView = getUnboxWorkspaceTabFromSearch(searchParams);

  const setUnboxView = useCallback(
    (nextTab: UnboxWorkspaceTab, opts?: { clearLine?: boolean }) => {
      if (nextTab === unboxView) return;
      // Different list = drop the prior pick (mirrors useReceivingMode).
      // Scan auto-switch passes clearLine:false so the just-resolved workspace stays open.
      if (opts?.clearLine !== false) {
        window.dispatchEvent(new CustomEvent('receiving-clear-line'));
      }
      const params = new URLSearchParams(searchParams.toString());
      normalizeUnboxWorkspaceTabParams(params, nextTab);
      const qs = params.toString();
      const base = receivingSurfaceBasePath(pathname) || '/unbox';
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams, unboxView],
  );

  return { unboxView, setUnboxView };
}
