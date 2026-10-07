/**
 * Last-seen `NavContext` per URL, persisted so the sidebar paints from cache on
 * a fresh load and revalidates behind it (`/api/nav/context` pays the ≈300 ms
 * `withAuth` floor; first paint never waits on it).
 *
 * Keyed by staff: the context is permission-filtered, and a shared desk switches
 * staff in place. Bounded LRU so a long session cannot grow it without limit.
 *
 * Each entry carries the nav contract it was resolved under (`NAV_CONTRACT`,
 * stamped on the document as `<meta name="nav-contract">`). An entry from
 * another contract — a page that has since dropped a Sort row or a filter —
 * never paints; the fresh context replaces it.
 */

import { NavContextSchema, type NavContext } from '@/lib/nav/context/schema';

/** The `<meta name>` the root layout writes `NAV_CONTRACT` into. */
export const NAV_CONTRACT_META_NAME = 'nav-contract';

// v4 entries are `{ contract, nav }`; every unstamped v3 entry is dropped.
const STORAGE_PREFIX = 'nav-context:v4:';
const MAX_ENTRIES = 40;

type SnapshotMap = Record<string, { contract: string; nav: NavContext }>;

function storageKey(staffKey: string): string {
  return `${STORAGE_PREFIX}${staffKey}`;
}

function entryKey(path: string, view: 'top' | undefined): string {
  return view ? `${view} ${path}` : path;
}

/** The contract this document was served under; `undefined` disables the snapshot. */
function documentContract(): string | undefined {
  return document.querySelector<HTMLMetaElement>(`meta[name="${NAV_CONTRACT_META_NAME}"]`)?.content || undefined;
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
  const contract = typeof window === 'undefined' ? undefined : documentContract();
  if (!hit || !contract || hit.contract !== contract) return undefined;
  // A snapshot written by an older contract must not paint a wrong sidebar.
  const parsed = NavContextSchema.safeParse(hit.nav);
  return parsed.success ? parsed.data : undefined;
}

export function writeNavContextSnapshot(
  staffKey: string,
  path: string,
  view: 'top' | undefined,
  nav: NavContext,
): void {
  if (typeof window === 'undefined') return;
  const contract = documentContract();
  if (!contract) return;
  const key = entryKey(path, view);
  const map = readMap(staffKey);
  delete map[key];
  map[key] = { contract, nav };
  const keys = Object.keys(map);
  for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete map[stale];
  try {
    window.localStorage.setItem(storageKey(staffKey), JSON.stringify(map));
  } catch {
    // Quota / private mode: the network path still works.
  }
}
