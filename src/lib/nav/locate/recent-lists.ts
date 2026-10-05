'use client';

/**
 * The staffer's recently pasted lists (owner 2026-10-04): the last ten, newest
 * first, per staff member in this browser (`localStorage`, keyed by the nav
 * staff key — org + staff). An identical list pasted again moves to the top
 * instead of repeating. Every face that holds a pasted list records through
 * `useBulkList.paste`; the bar's dropdown reads them back.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { NavLocateScope } from '@/lib/nav/context/schema';
import { useNavStaffKey } from '@/lib/nav/context/use-nav-staff-key';

export interface RecentList {
  /** The list itself (refs in paste order) — also its identity. */
  id: string;
  /** When it was last pasted (epoch ms). */
  at: number;
  refs: string[];
  /** Whose buckets answered it: a section's page, or everywhere. */
  scope: NavLocateScope;
  /** The page it was pasted on. */
  path: string;
}

const MAX_RECENT = 10;
const STORAGE_PREFIX = 'cf:recent-pasted-lists:';
const EMPTY: readonly RecentList[] = [];

const listeners = new Set<() => void>();
const cache = new Map<string, readonly RecentList[]>();

function storageKey(staffKey: string): string {
  return `${STORAGE_PREFIX}${staffKey}`;
}

function read(staffKey: string): readonly RecentList[] {
  const hit = cache.get(staffKey);
  if (hit) return hit;
  let lists: readonly RecentList[] = EMPTY;
  try {
    const raw = JSON.parse(window.localStorage.getItem(storageKey(staffKey)) ?? '[]') as unknown;
    if (Array.isArray(raw)) {
      lists = raw.filter(
        (item): item is RecentList =>
          typeof item === 'object' && item !== null && Array.isArray(item.refs) && typeof item.at === 'number',
      );
    }
  } catch {
    // Unreadable storage: no recents, never a crash.
  }
  cache.set(staffKey, lists);
  return lists;
}

function write(staffKey: string, lists: readonly RecentList[]): void {
  cache.set(staffKey, lists);
  try {
    window.localStorage.setItem(storageKey(staffKey), JSON.stringify(lists));
  } catch {
    // Storage full or blocked: the recents still hold for this visit.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Record a pasted list for this staffer (outside React — `useBulkList.paste` calls it). */
export function recordRecentList(staffKey: string, refs: readonly string[], scope: NavLocateScope, path: string): void {
  if (typeof window === 'undefined' || refs.length < 2) return;
  const id = refs.join('\n');
  const rest = read(staffKey).filter((item) => item.id !== id);
  write(staffKey, [{ id, at: Date.now(), refs: [...refs], scope, path }, ...rest].slice(0, MAX_RECENT));
}

export interface RecentLists {
  lists: readonly RecentList[];
  remove: (id: string) => void;
  clear: () => void;
}

export function useRecentLists(): RecentLists {
  const staffKey = useNavStaffKey();
  const lists = useSyncExternalStore(
    subscribe,
    () => read(staffKey),
    () => EMPTY,
  );
  const remove = useCallback((id: string) => write(staffKey, read(staffKey).filter((item) => item.id !== id)), [staffKey]);
  const clear = useCallback(() => write(staffKey, EMPTY), [staffKey]);
  return { lists, remove, clear };
}
