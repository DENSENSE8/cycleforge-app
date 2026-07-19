/**
 * search-recents — the single source of truth for typed search-query history
 * (docs/unified-global-search-consolidation-plan.md §3.2, decision D3).
 *
 * Replaces the 5+ siloed localStorage buckets (`dashboard_search_history`,
 * `shipped_search_history`, `inventory_search_history_${tab}`, …) with ONE
 * MRU array keyed by `cf_search_recents_v1`. Every surface — the global
 * header dropdown and the per-page recents dropdowns — reads from here.
 *
 * Client-only (localStorage-backed) but written to no-op safely under SSR /
 * Node (guards on `localStorage` availability, wraps every access in
 * try/catch) so it can be imported anywhere and unit-tested with a fake store.
 *
 * NOT navigation history: `command-bar-recent` stores last-*opened records*
 * (D4) and is deliberately NOT migrated here — this store holds last-*typed
 * queries* only.
 */

import { safeRandomUUID } from '@/lib/safe-uuid';
import { resolveSearchScopeLabel } from './search-scope-labels';

export interface SearchRecentTopHit {
  title: string;
  href: string;
  entityType: string;
}

export interface SearchRecentEntry {
  /** Stable id (safeRandomUUID) — the remove/react-key handle. */
  id: string;
  /** The typed query. */
  query: string;
  /** `'global'` or a canonical scope key, e.g. `'inventory:skus'`. */
  scope: string;
  /** Human label for the scope chip; resolved from `scope` when absent. */
  scopeLabel?: string;
  /** Explicit re-run target; defaults to `/dashboard?mode=search&q=` when absent. */
  scopeHref?: string;
  /** ISO timestamp of the most recent run. */
  timestamp: string;
  /** Optional result count captured from the last run. */
  resultCount?: number;
  /** Optional top hit captured from the last run (preview affordance). */
  topHit?: SearchRecentTopHit;
}

export const SEARCH_RECENTS_STORAGE_KEY = 'cf_search_recents_v1';
export const LEGACY_SEARCH_RECENTS_STORAGE_KEY = 'usav_search_recents_v1';
export const SEARCH_RECENTS_MIGRATED_KEY = 'cf_search_recents_migrated_v1';
export const LEGACY_SEARCH_RECENTS_MIGRATED_KEY = 'usav_search_recents_migrated_v1';
/** Hard cap on stored entries (D3 / plan Q2 default). */
export const SEARCH_RECENTS_MAX = 100;
/** Broadcast on every mutation so `useSearchRecents` can re-read in-tab. */
export const SEARCH_RECENTS_EVENT = 'cf-search-recents-changed';

/** Legacy buckets seeded once into the unified store (non-destructive). */
const LEGACY_QUERY_BUCKETS: Array<{ key: string; scope: string }> = [
  { key: 'dashboard_search_history', scope: 'dashboard' },
  { key: 'shipped_search_history', scope: 'shipped' },
];
const LEGACY_INVENTORY_TABS = [
  'activity',
  'bins',
  'skus',
  'units',
  'alerts',
  'counts',
  'triage',
  'pulse',
];

function getStore(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function dedupeKey(scope: string, query: string): string {
  return `${scope}${query.trim().toLowerCase()}`;
}

function isValidEntry(v: unknown): v is SearchRecentEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return typeof e.query === 'string' && typeof e.scope === 'string' && typeof e.timestamp === 'string';
}

function normalizeTimestamp(raw: unknown, fallbackIso: string): string {
  if (typeof raw === 'string') {
    const t = new Date(raw).getTime();
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  if (typeof raw === 'number') {
    const t = new Date(raw).getTime();
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return fallbackIso;
}

function broadcast(): void {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SEARCH_RECENTS_EVENT));
    }
  } catch {
    /* non-essential */
  }
}

/** Read the raw, validated, newest-first list. */
export function listSearchRecents(filter?: { scope?: string; limit?: number }): SearchRecentEntry[] {
  const store = getStore();
  if (!store) return [];
  let entries: SearchRecentEntry[] = [];
  try {
    const raw = store.getItem(SEARCH_RECENTS_STORAGE_KEY) ?? store.getItem(LEGACY_SEARCH_RECENTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) entries = parsed.filter(isValidEntry);
    }
  } catch {
    return [];
  }
  if (filter?.scope) entries = entries.filter((e) => e.scope === filter.scope);
  if (filter?.limit != null) entries = entries.slice(0, filter.limit);
  return entries;
}

function writeAll(entries: SearchRecentEntry[]): void {
  const store = getStore();
  if (!store) return;
  try {
    store.setItem(SEARCH_RECENTS_STORAGE_KEY, JSON.stringify(entries.slice(0, SEARCH_RECENTS_MAX)));
  } catch {
    /* quota / private-mode — non-essential */
  }
}

/**
 * MRU insert: drop any prior entry with the same (scope, case-insensitive
 * query), unshift the new one, cap at SEARCH_RECENTS_MAX. Returns the stored
 * entry (or null when the query is blank / no store).
 */
export function pushSearchRecent(
  entry: Omit<SearchRecentEntry, 'id' | 'timestamp'> & { timestamp?: string },
): SearchRecentEntry | null {
  const query = entry.query?.trim();
  if (!query) return null;
  const store = getStore();
  if (!store) return null;

  const full: SearchRecentEntry = {
    ...entry,
    query,
    id: safeRandomUUID(),
    timestamp: entry.timestamp ?? new Date().toISOString(),
  };
  const key = dedupeKey(full.scope, full.query);
  const next = [full, ...listSearchRecents().filter((e) => dedupeKey(e.scope, e.query) !== key)].slice(
    0,
    SEARCH_RECENTS_MAX,
  );
  writeAll(next);
  broadcast();
  return full;
}

/** Remove a single entry by id. */
export function removeSearchRecent(id: string): void {
  const next = listSearchRecents().filter((e) => e.id !== id);
  writeAll(next);
  broadcast();
}

/** Clear all recents, or just one scope. */
export function clearSearchRecents(scope?: string): void {
  if (!scope) {
    const store = getStore();
    if (store) {
      try {
        store.removeItem(SEARCH_RECENTS_STORAGE_KEY);
      } catch {
        /* non-essential */
      }
    }
    broadcast();
    return;
  }
  writeAll(listSearchRecents().filter((e) => e.scope !== scope));
  broadcast();
}

/** Re-run target for a recent — explicit scopeHref, else Dashboard Search mode. */
export function recentRerunHref(entry: Pick<SearchRecentEntry, 'query' | 'scopeHref'>): string {
  if (entry.scopeHref) return entry.scopeHref;
  return `/dashboard?mode=search&q=${encodeURIComponent(entry.query)}`;
}

/**
 * One-time, NON-DESTRUCTIVE seed of the legacy per-domain buckets into the
 * unified store. Guarded by a marker key so it runs once per browser; the old
 * keys are LEFT IN PLACE (the sidebars still read them during the transition —
 * deletion is Phase 6, gated on `deleteLegacy`). Idempotent regardless via the
 * dedupe on (scope, query).
 */
export function migrateLegacyRecents(opts: { deleteLegacy?: boolean } = {}): void {
  const store = getStore();
  if (!store) return;
  try {
    if (store.getItem(SEARCH_RECENTS_MIGRATED_KEY) === '1' || store.getItem(LEGACY_SEARCH_RECENTS_MIGRATED_KEY) === '1') return;
  } catch {
    return;
  }

  const nowIso = new Date().toISOString();
  const imported: SearchRecentEntry[] = [];

  const buckets: Array<{ key: string; scope: string }> = [
    ...LEGACY_QUERY_BUCKETS,
    ...LEGACY_INVENTORY_TABS.map((tab) => ({ key: `inventory_search_history_${tab}`, scope: `inventory:${tab}` })),
  ];

  for (const { key, scope } of buckets) {
    let raw: string | null = null;
    try {
      raw = store.getItem(key);
    } catch {
      continue;
    }
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    for (const item of parsed) {
      const query = (item as { query?: unknown })?.query;
      if (typeof query !== 'string' || !query.trim()) continue;
      imported.push({
        id: safeRandomUUID(),
        query: query.trim(),
        scope,
        scopeLabel: resolveSearchScopeLabel(scope),
        timestamp: normalizeTimestamp((item as { timestamp?: unknown }).timestamp, nowIso),
        resultCount:
          typeof (item as { resultCount?: unknown }).resultCount === 'number'
            ? (item as { resultCount: number }).resultCount
            : undefined,
      });
    }
  }

  if (imported.length > 0) {
    // Newest-first merge: existing entries win a dedupe tie (they're MRU).
    const existing = listSearchRecents();
    const seen = new Set(existing.map((e) => dedupeKey(e.scope, e.query)));
    const merged = [...existing];
    for (const e of imported) {
      const k = dedupeKey(e.scope, e.query);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(e);
    }
    merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    writeAll(merged);
    broadcast();
  }

  try {
    store.setItem(SEARCH_RECENTS_MIGRATED_KEY, '1');
    if (opts.deleteLegacy) {
      for (const { key } of buckets) store.removeItem(key);
    }
  } catch {
    /* non-essential */
  }
}

// ─── Pure presentation helpers (unit-tested; no storage) ────────────────────

/** Compact relative time: "just now" / "5m" / "3h" / "2d" / "1w" / "4mo". */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (d < 30) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y`;
}

export interface RecentsDayGroup {
  label: string;
  entries: SearchRecentEntry[];
}

/** Group newest-first recents into calendar-day bands (Today / Yesterday / …). */
export function groupRecentsByDay(
  entries: SearchRecentEntry[],
  now: number = Date.now(),
): RecentsDayGroup[] {
  const startOfDay = (ms: number): number => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today = startOfDay(now);
  const dayMs = 86_400_000;

  const bands = new Map<string, SearchRecentEntry[]>();
  const order: string[] = [];

  for (const e of entries) {
    const t = new Date(e.timestamp).getTime();
    const day = Number.isFinite(t) ? startOfDay(t) : today;
    let label: string;
    if (day === today) label = 'Today';
    else if (day === today - dayMs) label = 'Yesterday';
    else if (today - day < 7 * dayMs) label = new Date(day).toLocaleDateString(undefined, { weekday: 'long' });
    else label = new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    if (!bands.has(label)) {
      bands.set(label, []);
      order.push(label);
    }
    bands.get(label)!.push(e);
  }

  return order.map((label) => ({ label, entries: bands.get(label)! }));
}
