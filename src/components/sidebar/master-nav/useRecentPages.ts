'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSidebarNavPageId, getSidebarPageNav } from '@/lib/sidebar-navigation';

// Storage key is DELIBERATELY unchanged by the 2026-08-03 vocabulary rename:
// it is a persistence contract, and renaming it would silently empty every
// operator's recents. Same rule as `?mode=` on the wire.
const STORAGE_KEY = 'sidebar.recentModes';
/**
 * Max cross-page MRU rows in {@link HeaderRecentsSwitcher} (excludes the
 * active page). One knob — menu face and storage share this cap.
 */
export const MAX_RECENT_PAGES = 5;
/** Persist one extra slot so the active page can sit in storage without starving the menu. */
const STORAGE_MAX = MAX_RECENT_PAGES + 1;

/** A visited page + child-page pair for the GlobalHeader more-recent menu. */
export interface RecentPageRef {
  pageId: string;
  /** Null = a page with no children (or “land on page default”). */
  childId: string | null;
}

function refKey(ref: RecentPageRef): string {
  return `${ref.pageId}:${ref.childId ?? ''}`;
}

/**
 * True when this MRU row is the page the operator is already on.
 * Same page id always counts (stations have no children, so a child-key-only
 * skip left Shipping in the menu while the trigger already said Shipping).
 * Href match covers aliases (`/shipping` ↔ `/outbound`).
 */
export function isCurrentRecentRef(
  ref: RecentPageRef,
  pageId: string,
  _childId: string | null,
  pathname?: string | null,
): boolean {
  const fromPath = pathname ? getSidebarNavPageId(pathname) : 'unknown';
  const liveId =
    pageId && pageId !== 'unknown' ? pageId : fromPath !== 'unknown' ? fromPath : '';
  if (!liveId) return false;
  if (ref.pageId === liveId) return true;
  const current = getSidebarPageNav(liveId);
  const other = getSidebarPageNav(ref.pageId);
  if (current && other && current.href === other.href) return true;
  if (fromPath !== 'unknown' && ref.pageId === fromPath) return true;
  return false;
}

/**
 * MRU refs for the Recents menu: one row per MasterNav L1 page (APP_SIDEBAR_NAV
 * id), most-recent first. Desk children (`orders` / `shipped`) stay in storage
 * for restore but must not paint as "Shipping · To ship".
 */
export function recentsAsMasterNavRows(
  refs: readonly RecentPageRef[],
  pageId: string,
  childId: string | null,
  pathname?: string | null,
  max: number = MAX_RECENT_PAGES,
): RecentPageRef[] {
  const out: RecentPageRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (out.length >= max) break;
    if (isCurrentRecentRef(ref, pageId, childId, pathname)) continue;
    if (seen.has(ref.pageId)) continue;
    seen.add(ref.pageId);
    out.push(ref);
  }
  return out;
}

function isRecentPageRef(value: unknown): value is RecentPageRef {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.pageId !== 'string' || !v.pageId) return false;
  if (v.childId !== null && typeof v.childId !== 'string') return false;
  return true;
}

/**
 * localStorage-backed recent pages for the GlobalHeader more-recent menu.
 * Pins the last {@link MAX_RECENT_PAGES} distinct page + child pairs
 * (most-recent first). SSR-safe: starts empty, hydrates on mount.
 */
export function useRecentPages() {
  const [recents, setRecents] = useState<RecentPageRef[]>([]);
  const [recentsReady, setRecentsReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecents(parsed.filter(isRecentPageRef).slice(0, STORAGE_MAX));
        }
      }
    } catch {
      /* corrupt / unavailable storage — start empty */
    }
    setRecentsReady(true);
  }, []);

  const pushRecent = useCallback((pageId: string, childId: string | null) => {
    if (!pageId || pageId === 'unknown') return;
    const entry: RecentPageRef = { pageId, childId };
    setRecents((prev) => {
      const key = refKey(entry);
      const next = [entry, ...prev.filter((r) => refKey(r) !== key)].slice(0, STORAGE_MAX);
      if (next.length === prev.length && next.every((r, i) => refKey(r) === refKey(prev[i]!))) {
        return prev;
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota / private-mode failures */
      }
      return next;
    });
  }, []);

  return { recents, recentsReady, pushRecent };
}
