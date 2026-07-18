'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'sidebar.recentModes';
/** Max jump chips shown in the closed header (excludes the active mode). */
export const MAX_RECENT_MODES = 3;
/** Persist one extra slot so the active mode can sit in storage without starving the chips. */
const STORAGE_MAX = MAX_RECENT_MODES + 1;

/** A visited page+mode pair for the master-nav header jump chips. */
interface RecentModeRef {
  pageId: string;
  /** Null = modeless page (or “land on page default”). */
  modeId: string | null;
}

function modeKey(ref: RecentModeRef): string {
  return `${ref.pageId}:${ref.modeId ?? ''}`;
}

function isRecentModeRef(value: unknown): value is RecentModeRef {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.pageId !== 'string' || !v.pageId) return false;
  if (v.modeId !== null && typeof v.modeId !== 'string') return false;
  return true;
}

/**
 * localStorage-backed recent modes for the master-nav closed trigger.
 * Pins the last {@link MAX_RECENT_MODES} distinct page+mode pairs (most-recent
 * first) so the header can offer quiet jump chips without opening the menu.
 * SSR-safe: starts empty, hydrates on mount.
 */
export function useRecentModes() {
  const [recents, setRecents] = useState<RecentModeRef[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setRecents(parsed.filter(isRecentModeRef).slice(0, STORAGE_MAX));
    } catch {
      /* corrupt / unavailable storage — start empty */
    }
  }, []);

  const pushRecent = useCallback((pageId: string, modeId: string | null) => {
    if (!pageId || pageId === 'unknown') return;
    const entry: RecentModeRef = { pageId, modeId };
    setRecents((prev) => {
      const key = modeKey(entry);
      const next = [entry, ...prev.filter((r) => modeKey(r) !== key)].slice(0, STORAGE_MAX);
      if (next.length === prev.length && next.every((r, i) => modeKey(r) === modeKey(prev[i]!))) {
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
