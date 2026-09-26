'use client';

/** URL ⇄ state for the /support sidebar's mode switcher. */

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  parseSupportMode,
  type SupportMode,
} from './support-sidebar-shared';
import { buildRouteUrl } from '@/lib/routing/route-params';
import { routeParamsFor } from '@/lib/routing/registry';

interface SupportModeState {
  /** Active mode parsed from `?mode=` (defaults to `tickets`). */
  mode: SupportMode;
  /** Swap `?mode=`, clearing mode-scoped params; `tickets` drops the param. */
  updateMode: (next: SupportMode) => void;
}

export function useSupportMode(): SupportModeState {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseSupportMode(searchParams.get('mode'));

  const updateMode = useCallback(
    (next: SupportMode) => {
      // CONSTRUCT the target; `tickets` is the default and carries no `mode`.
      const spec = routeParamsFor('/support')!;
      const staff = searchParams.get('staff') ?? searchParams.get('staffId');
      router.replace(buildRouteUrl(spec, { mode: next === 'tickets' ? null : next, staff }));
    },
    [router, searchParams],
  );

  return { mode, updateMode };
}
