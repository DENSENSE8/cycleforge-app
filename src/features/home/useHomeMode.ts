'use client';

/**
 * URL ⇄ state for the Home ("/") mode switcher.
 *
 * Keeps `?mode=` as the single source of truth so a refresh / deep-link is
 * preserved and the region reacts to the same param. On a mode switch we clear
 * the mode-scoped params (selection, search) so each mode opens clean.
 * Mirrors `useOperationsMode`.
 */

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { parseHomeMode, type HomeMode } from './home-modes';
import { buildRouteUrl } from '@/lib/routing/route-params';
import { routeParamsFor } from '@/lib/routing/registry';

export interface HomeModeState {
  /** Active mode parsed from `?mode=` (defaults to `today`). */
  mode: HomeMode;
  /** Swap `?mode=`, clearing mode-scoped params; `today` drops the param. */
  updateMode: (next: HomeMode) => void;
}

export function useHomeMode(): HomeModeState {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseHomeMode(searchParams.get('mode'));

  const updateMode = useCallback(
    (next: HomeMode) => {
      // CONSTRUCT the target — the current query string is never copied, so
      // there is no HOME_MODE_SCOPED_PARAMS list to keep in step. `today` is the
      // default and carries no `mode`.
      const spec = routeParamsFor('/')!;
      const staff = searchParams.get('staff') ?? searchParams.get('staffId');
      router.replace(buildRouteUrl(spec, { mode: next === 'today' ? null : next, staff }));
    },
    [router, searchParams],
  );

  return { mode, updateMode };
}
