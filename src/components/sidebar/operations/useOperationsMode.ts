'use client';

/** URL ⇄ state for the Operations sidebar's mode switcher. */

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  parseOperationsMode,
  type OperationsMode,
} from './operations-sidebar-shared';
import { buildRouteUrl } from '@/lib/routing/route-params';
import { routeParamsFor } from '@/lib/routing/registry';

interface OperationsModeState {
  /** Active mode parsed from `?mode=` (defaults to `live`). */
  mode: OperationsMode;
  /** Swap `?mode=`, clearing mode-scoped params; `live` drops the param. */
  updateMode: (next: OperationsMode) => void;
}

export function useOperationsMode(): OperationsModeState {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseOperationsMode(searchParams.get('mode'));

  const updateMode = useCallback(
    (next: OperationsMode) => {
      // CONSTRUCT the target.
      const spec = routeParamsFor('/operations')!;
      const staff = searchParams.get('staff') ?? searchParams.get('staffId');
      router.replace(buildRouteUrl(spec, { mode: next === 'live' ? null : next, staff }));
    },
    [router, searchParams],
  );

  return { mode, updateMode };
}
