'use client';

import { useCallback, useEffect, useState } from 'react';

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
interface RecentPageRef {
  pageId: string;
  /** Null = a page with no children (or “land on page default”). */
  childId: string | null;
}

function refKey(ref: RecentPageRef): string {
  return `${ref.pageId}:${ref.childId ?? ''}`;
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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setRecents(parsed.filter(isRecentPageRef).slice(0, STORAGE_MAX));
    } catch {
      /* corrupt / unavailable storage — start empty */
    }
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

  return { recents, pushRecent };
}
