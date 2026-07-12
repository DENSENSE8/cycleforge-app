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
import { HOME_MODE_SCOPED_PARAMS, parseHomeMode, type HomeMode } from './home-modes';

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
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'today') params.delete('mode');
      else params.set('mode', next);
      for (const key of HOME_MODE_SCOPED_PARAMS) params.delete(key);
      const qs = params.toString();
      router.replace(qs ? `/?${qs}` : '/');
    },
    [router, searchParams],
  );

  return { mode, updateMode };
}
