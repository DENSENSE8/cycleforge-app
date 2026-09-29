'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { fetchNavContext } from '@/lib/nav/context/http-client';
import type { NavContext } from '@/lib/nav/context/schema';
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

export function useNavStaffKey(): string {
  const { user } = useAuth();
  return user?.staffId != null ? String(user.staffId) : 'anon';
}

/**
 * `GET /api/nav/context` for `path`, rendered from the persisted snapshot and
 * revalidated behind it. `view: 'top'` is the `‹` peek.
 */
export function useNavContext(
  path: string,
  options: { view?: 'top'; enabled?: boolean } = {},
) {
  const { view, enabled = true } = options;
  const staffKey = useNavStaffKey();
  const query = useQuery({
    queryKey: navContextQueryKey(staffKey, path, view),
    queryFn: ({ signal }) => fetchNavContext(path, { view, signal }),
    initialData: () => readNavContextSnapshot(staffKey, path, view),
    // A snapshot is always stale: paint it, then revalidate.
    initialDataUpdatedAt: 0,
    staleTime: NAV_CONTEXT_STALE_MS,
    placeholderData: keepPreviousData,
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
// Suspense'd probe below publishes the resolved flag instead.

let contextualActive = false;
const listeners = new Set<() => void>();

function setContextualActive(next: boolean): void {
  if (contextualActive === next) return;
  contextualActive = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while the current page resolves `rollout: 'contextual'`. */
export function useContextualSidebarActive(): boolean {
  return useSyncExternalStore(subscribe, () => contextualActive, () => false);
}

export function isContextualNav(nav: NavContext | undefined): boolean {
  return nav?.rollout === 'contextual';
}

/** Renders nothing; resolves the current page's rollout and publishes it. */
export function NavRolloutProbe() {
  const path = useCurrentNavPath();
  const { data } = useNavContext(path);
  const active = isContextualNav(data);
  useEffect(() => {
    setContextualActive(active);
  }, [active]);
  useEffect(() => () => setContextualActive(false), []);
  return null;
}
