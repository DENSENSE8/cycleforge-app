'use client';

import { useSyncExternalStore } from 'react';
import type { TimeFormat } from '@/lib/schemas/staff-preferences-constants';
import { DEFAULT_TIME_FORMAT } from '@/lib/schemas/staff-preferences-constants';
import { getTimeFormat, subscribe } from './store';

/**
 * Subscribe a component to the live time-format preference so it re-renders the
 * instant the user flips 12h↔24h (no refresh). The server snapshot is the
 * default (`12h`) — which matches the app's historical render — so there is no
 * hydration mismatch.
 *
 * Components that only render a timestamp once (and don't need live updates) can
 * skip this and rely on the formatters reading the store default directly.
 */
export function useTimeFormat(): TimeFormat {
  return useSyncExternalStore(subscribe, getTimeFormat, () => DEFAULT_TIME_FORMAT);
}
