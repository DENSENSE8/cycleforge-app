'use client';

import { useSyncExternalStore } from 'react';
import type { TimeFormat } from '@/lib/schemas/staff-preferences-constants';
import { DEFAULT_TIME_FORMAT } from '@/lib/schemas/staff-preferences-constants';
import { getTimeFormat, subscribe } from './store';

/** Subscribe a component to the live time-format preference so it re-renders the instant the user flips 12h↔24h (no refresh). */
export function useTimeFormat(): TimeFormat {
  return useSyncExternalStore(subscribe, getTimeFormat, () => DEFAULT_TIME_FORMAT);
}
