/**
 * Last-seen `NavContext` per URL, persisted so the sidebar paints from cache on
 * a fresh load and revalidates behind it (`/api/nav/context` pays the ≈300 ms
 * `withAuth` floor; first paint never waits on it).
 *
 * Keyed by staff: the context is permission-filtered, and a shared desk switches
 * staff in place. Bounded LRU so a long session cannot grow it without limit.
 */

import { NavContextSchema, type NavContext } from '@/lib/nav/context/schema';

// v2 keys added organization + staff (the staff-only cache cannot prove its
// tenant). v3 drops every v2 snapshot written while scan stations still
// declared a Sort row — a schema-valid old panel must not paint on first load.
const STORAGE_PREFIX = 'nav-context:v3:';
const MAX_ENTRIES = 40;

type SnapshotMap = Record<string, NavContext>;

function storageKey(staffKey: string): string {
  return `${STORAGE_PREFIX}${staffKey}`;
}

function entryKey(path: string, view: 'top' | undefined): string {
  return view ? `${view} ${path}` : path;
}

function readMap(staffKey: string): SnapshotMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey(staffKey));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as SnapshotMap) : {};
  } catch {
    return {};
  }
}

export function readNavContextSnapshot(
  staffKey: string,
  path: string,
  view: 'top' | undefined,
): NavContext | undefined {
  const hit = readMap(staffKey)[entryKey(path, view)];
  if (!hit) return undefined;
  // A snapshot written by an older contract must not paint a wrong sidebar.
  const parsed = NavContextSchema.safeParse(hit);
  return parsed.success ? parsed.data : undefined;
}

export function writeNavContextSnapshot(
  staffKey: string,
  path: string,
  view: 'top' | undefined,
  nav: NavContext,
): void {
  if (typeof window === 'undefined') return;
  const key = entryKey(path, view);
  const map = readMap(staffKey);
  delete map[key];
  map[key] = nav;
  const keys = Object.keys(map);
  for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete map[stale];
  try {
    window.localStorage.setItem(storageKey(staffKey), JSON.stringify(map));
  } catch {
    // Quota / private mode: the network path still works.
  }
}
