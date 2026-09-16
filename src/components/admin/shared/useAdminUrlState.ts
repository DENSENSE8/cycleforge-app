'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Shared URL-state helper for the ex-admin rails and tabs. Wraps Next's
 * `useSearchParams` with a `setParam(mutator)` that replaces the CURRENT
 * pathname's query while keeping the rest of it intact, so URL state stays the
 * single source of truth for selection + filters.
 *
 * The pathname used to be the literal `/admin` — correct while every consumer
 * was a section of that one console. The admin dissolution re-homed them
 * (Goals / Logs / Staff → `/operations?mode=*`, the FNSKU catalog →
 * `/shipping/fba?fbaMode=catalog`, the sourcing pickers → `/sourcing?mode=*`,
 * NAS photos → `/settings/photos`), and a hard-coded destination would have
 * navigated every filter keystroke off the page the operator is on.
 */
export function useAdminUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutator(next);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  return { searchParams, setParam };
}
