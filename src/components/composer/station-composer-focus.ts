'use client';

/** "Put the caret in the station composer" — a request, sent by a surface that is not the composer. */

import { useEffect } from 'react';

const STATION_COMPOSER_FOCUS_EVENT = 'cf:station-composer-focus';

/** Ask the mounted station composer to take focus. No-op server-side. */
export function requestStationComposerFocus(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STATION_COMPOSER_FOCUS_EVENT));
}

/** Subscribe the composer to focus requests. */
export function useStationComposerFocusRequests(onRequest: () => void): void {
  useEffect(() => {
    const handler = () => onRequest();
    window.addEventListener(STATION_COMPOSER_FOCUS_EVENT, handler);
    return () => window.removeEventListener(STATION_COMPOSER_FOCUS_EVENT, handler);
  }, [onRequest]);
}
