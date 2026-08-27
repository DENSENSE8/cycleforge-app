'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  getPackWorkspaceTabFromSearch,
  normalizePackWorkspaceTabParams,
  type PackWorkspaceTab,
} from '@/utils/pack-workspace-state';

/** URL SoT for Pack workbench tabs (`?packview=` on `/pack`). */
export function usePackWorkspaceTab() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const packView = getPackWorkspaceTabFromSearch(searchParams);

  const setPackView = useCallback(
    (nextTab: PackWorkspaceTab, opts?: { clearOrder?: boolean }) => {
      if (nextTab === packView) return;
      if (opts?.clearOrder !== false) {
        window.dispatchEvent(new CustomEvent('pack-active-order-changed', { detail: null }));
      }
      const params = new URLSearchParams(searchParams.toString());
      normalizePackWorkspaceTabParams(params, nextTab);
      const qs = params.toString();
      const base = pathname || '/pack';
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams, packView],
  );

  return { packView, setPackView };
}
