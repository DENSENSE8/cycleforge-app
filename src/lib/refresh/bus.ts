'use client';

/**
 * The refresh bus — emit a domain signal, subscribe to one.
 *
 * Deliberately still a DOM event rather than a shared react-query call: emitters
 * live in plain modules (`salesCartStore`, `utils/events`) with no `QueryClient`
 * in scope, and four of the ten listeners are hand-rolled `fetch` + `setState`
 * with no query key to invalidate. The event keeps every emitter callable from
 * anywhere; the domain payload is what removes the fan-out.
 *
 * Migrating a hand-rolled listener onto react-query later is a local change —
 * it keeps the same `useRefreshSignal(domain, …)` subscription and swaps what
 * the handler does.
 *
 * Contract + domain list: {@link ./domains}.
 */

import { useEffect, useRef } from 'react';
import {
  REFRESH_EVENT,
  type RefreshDomain,
  type RefreshEventDetail,
} from './domains';

/**
 * Signal that `domains` changed. Name every domain the write actually touched —
 * naming too few leaves a stale pane, naming all of them is the broadcast this
 * replaced.
 */
export function refreshDomains(domains: readonly RefreshDomain[]): void {
  if (typeof window === 'undefined') return;
  if (domains.length === 0) return;
  window.dispatchEvent(
    new CustomEvent<RefreshEventDetail>(REFRESH_EVENT, { detail: { domains } }),
  );
}

/** Single-domain shorthand for the common case. */
export function refreshDomain(domain: RefreshDomain): void {
  refreshDomains([domain]);
}

function detailDomains(event: Event): readonly RefreshDomain[] {
  const detail = (event as CustomEvent<RefreshEventDetail>).detail;
  return Array.isArray(detail?.domains) ? detail.domains : [];
}

/**
 * Run `handler` when any of `domains` is signalled.
 *
 * `handler` is held in a ref, so a fresh closure each render does not tear down
 * and re-add the `window` listener — the bug that made the old bus re-subscribe
 * on every parent re-render.
 */
export function useRefreshSignal(
  domains: RefreshDomain | readonly RefreshDomain[],
  handler: () => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  // Stringified so an inline array literal does not re-run the effect forever.
  const wanted = Array.isArray(domains) ? domains : [domains as RefreshDomain];
  const key = wanted.join('|');

  useEffect(() => {
    const listening = new Set(key.split('|'));
    const onRefresh = (event: Event) => {
      if (detailDomains(event).some((domain) => listening.has(domain))) {
        handlerRef.current();
      }
    };
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, [key]);
}
