'use client';

/**
 * URL ⇄ state for the Operations sidebar's mode switcher.
 *
 * Keeps `?mode=` as the single source of truth so a refresh / deep-link is
 * preserved and the right pane can react to the same param. On a mode switch we
 * clear the mode-scoped params (search, selection, range…) so each mode opens
 * clean. Mirrors `useReceivingMode`.
 */

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  parseOperationsMode,
  type OperationsMode,
} from './operations-sidebar-shared';
import { buildRouteUrl } from '@/lib/routing/route-params';
import { routeParamsFor } from '@/lib/routing/registry';

export interface OperationsModeState {
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
      // CONSTRUCT the target. This replaced a 26-key denylist — six modes'
      // filters, the Journey focus set and the Signals timeline — that a mode
      // switch had to delete one by one. `live` is the default and carries no
      // `mode`.
      const spec = routeParamsFor('/operations')!;
      const staff = searchParams.get('staff') ?? searchParams.get('staffId');
      router.replace(buildRouteUrl(spec, { mode: next === 'live' ? null : next, staff }));
    },
    [router, searchParams],
  );

  return { mode, updateMode };
}
