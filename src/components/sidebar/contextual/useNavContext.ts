'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useNavStaffKey } from '@/lib/nav/context/use-nav-staff-key';
import { fetchNavContext } from '@/lib/nav/context/http-client';
import type { NavContext } from '@/lib/nav/context/schema';
import { getSidebarNavPageId } from '@/lib/sidebar-navigation';
import { readNavContextSnapshot, writeNavContextSnapshot } from './nav-context-snapshot';

/** Revalidate at most this often per URL; the snapshot paints meanwhile. */
const NAV_CONTEXT_STALE_MS = 30_000;

export function navContextQueryKey(staffKey: string, path: string, view: 'top' | undefined) {
  return ['nav-context', staffKey, view ?? 'page', path] as const;
}

/**
 * The current in-app URL (pathname + search) — the `path` the context is keyed
 * on. Params are sorted: a desk that rewrites its URL in a different param
 * order (`/unbox?openReceivingId=…&lineId=…` → `?lineId=…&openReceivingId=…`)
 * is the same page and must not cost a second `/api/nav/context` round trip.
 */
export function useCurrentNavPath(): string {
  const pathname = usePathname() || '/';
  const params = new URLSearchParams(useSearchParams()?.toString() ?? '');
  params.sort();
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

const noopSubscribe = () => () => {};

/**
 * False on the server and through hydration, true after. The snapshot lives in
 * localStorage, which the server cannot see: painting it during hydration made
 * the client's first render disagree with the SSR HTML (React #418 on every
 * load with a snapshot, the whole shell re-rendered from scratch).
 */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * The last URL's context stands in only while it is the SAME page (a param
 * change). Another page's panel — its Sort row, filters, switchers — must never
 * paint under a new URL. The page map (`view: 'top'`) is one map for every URL.
 */
function carriesOver(previous: NavContext | undefined, path: string, view: 'top' | undefined): NavContext | undefined {
  if (!previous || view === 'top') return previous;
  const url = new URL(path, 'http://nav.local');
  return previous.page.id === getSidebarNavPageId(url.pathname, url.searchParams) ? previous : undefined;
}

/**
 * `GET /api/nav/context` for `path`, rendered from the persisted snapshot and
 * revalidated behind it. `view: 'top'` is the `‹` peek. The snapshot is a
 * placeholder painted only after hydration; the cache holds server truth only.
 */
export function useNavContext(
  path: string,
  options: { view?: 'top'; enabled?: boolean } = {},
) {
  const { view, enabled = true } = options;
  const staffKey = useNavStaffKey();
  const hydrated = useHydrated();
  const query = useQuery({
    queryKey: navContextQueryKey(staffKey, path, view),
    queryFn: ({ signal }) => fetchNavContext(path, { view, signal }),
    staleTime: NAV_CONTEXT_STALE_MS,
    placeholderData: (previous) =>
      carriesOver(previous, path, view) ?? (hydrated ? readNavContextSnapshot(staffKey, path, view) : undefined),
    enabled,
  });
  const fresh = query.isFetchedAfterMount ? query.data : undefined;
  useEffect(() => {
    if (fresh && !query.isPlaceholderData) writeNavContextSnapshot(staffKey, path, view, fresh);
  }, [fresh, query.isPlaceholderData, staffKey, path, view]);
  return query;
}

// ─── Rollout flag, published for the shell ────────────────────────────────────
//
// The shell decides column state (open by default for contextual pages) but
// cannot read `useSearchParams` without a Suspense boundary of its own. The
// Suspense'd probe below publishes the resolved flag instead. `null` = not
// resolved yet — the shell falls back to the page's static rollout so the
// column's space is in the first paint, not shoved in after the fetch.

let contextualActive: boolean | null = null;
const listeners = new Set<() => void>();

function setContextualActive(next: boolean | null): void {
  if (contextualActive === next) return;
  contextualActive = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the current page resolved `rollout: 'contextual'`; `null` until it has. */
export function useContextualSidebarActive(): boolean | null {
  return useSyncExternalStore(subscribe, () => contextualActive, () => null);
}

export function isContextualNav(nav: NavContext | undefined): boolean {
  return nav?.rollout === 'contextual';
}

/** Renders nothing; resolves the current page's rollout and publishes it. */
export function NavRolloutProbe() {
  const path = useCurrentNavPath();
  const { data } = useNavContext(path);
  const active = data ? isContextualNav(data) : null;
  useEffect(() => {
    setContextualActive(active);
  }, [active]);
  useEffect(() => () => setContextualActive(null), []);
  return null;
}
