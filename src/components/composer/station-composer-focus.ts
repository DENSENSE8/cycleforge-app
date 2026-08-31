'use client';

/**
 * "Put the caret in the station composer" — a request, sent by a surface that
 * is not the composer.
 *
 * A DOM CustomEvent rather than a threaded callback because the two ends are
 * far apart: the ticket thread sits in the workbench centre and the composer is
 * a dock mounted several components below it, with the whole line-edit panel in
 * between. Threading a ref up and back down would put a focus concern in four
 * files that have nothing else to do with focus.
 *
 * ## The rule this is allowed under
 *
 * `LineNotesCard` carries a deleted-code warning about composer auto-focus, and
 * it is the most expensive bug that bench can ship: focus used to jump into the
 * textarea on DERIVED step advance, so the next wedge scan was typed into the
 * note instead of the scan bar — nothing errored, nothing showed, and the
 * operator scanned the same box twice.
 *
 * That rule is "a composer is focused because the operator CLICKED it, never
 * because a derivation moved". This event is only ever dispatched from a real
 * operator gesture on the ticket thread, which is why it is allowed — and why
 * it is deliberately NOT wired to the mode switch itself. Shift+Tab and the
 * mode faces change what the field writes to and leave the caret where it was:
 * an operator who toggles modes mid-carton is very often about to scan.
 */

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
