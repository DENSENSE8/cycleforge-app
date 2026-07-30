'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { surfaceFromStorageKey } from '@/lib/saved-views/surfaces';

/**
 * `useSavedViews` — the ONE storage + URL-apply core behind every generic
 * saved-views surface (dashboard outbound + station/testing history). A "view"
 * is a named, encoded subset of the surface's `paramKeys`; views persist in the
 * polymorphic `saved_views` table (via `/api/saved-views`) and apply by writing
 * those params into the URL, so an applied view is shareable/bookmarkable.
 *
 * Consumers — exactly TWO, each supplying only `storageKey` + `paramKeys` and its
 * own UI: `OutboundSavedViewsList` (dashboard outbound sidebar, per lifecycle
 * mode) and `TableOptionsMenu` (station + testing history ⋮ menu). Ops and Media
 * Library keep their dedicated hooks/routes (`useOperationsSavedViews`,
 * `useMediaLibrarySavedViews`).
 *
 * **Saved views are operator-defined facet combinations. They are NOT the
 * lifecycle strip** — that boundary is the rule in
 * `.claude/rules/display/workbench.md` → Tabs vs. saved views. Do not add a
 * saved view that merely reproduces one lifecycle tab.
 *
 * The `storageKey` prop is preserved for call-site stability; it maps to a DB
 * `surface` via `src/lib/saved-views/surfaces.ts` (no longer writes localStorage).
 */

export interface SavedView {
  id: string;
  name: string;
  /** Encoded subset of the view's params (stable key order). */
  query: string;
}

export interface UseSavedViewsResult {
  views: SavedView[];
  /** Encoded current values of `paramKeys` (stable order) — for equality/save. */
  currentQuery: string;
  /** The saved view whose query matches the current URL, if any. */
  activeView: SavedView | null;
  /** True when at least one of the view's params is set in the URL. */
  hasActiveFilters: boolean;
  /** Apply a saved view: replace this surface's params with the view's, keep the rest. */
  applyView: (view: SavedView) => void;
  /** Save the current params under a name (replaces a same-name view). */
  saveView: (name: string) => void;
  /** Delete a saved view by id. */
  removeView: (id: string) => void;
}

type ServerView = {
  id: number;
  name: string;
  filters: Record<string, unknown>;
};

function toClientView(row: ServerView): SavedView {
  const query = typeof row.filters?.query === 'string' ? row.filters.query : '';
  return { id: String(row.id), name: row.name, query };
}

async function reqJson(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}

export function useSavedViews({
  storageKey,
  paramKeys,
}: {
  storageKey: string;
  paramKeys: readonly string[];
}): UseSavedViewsResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const surface = surfaceFromStorageKey(storageKey);

  const [views, setViews] = useState<SavedView[]>([]);

  useEffect(() => {
    if (!surface) {
      setViews([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/saved-views?surface=${encodeURIComponent(surface)}`);
        if (!res.ok) {
          if (!cancelled) setViews([]);
          return;
        }
        const json = await res.json();
        const rows: ServerView[] = Array.isArray(json?.views) ? json.views : [];
        if (!cancelled) setViews(rows.map(toClientView));
      } catch {
        if (!cancelled) setViews([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surface]);

  // Encode only the params that define a view, in a stable order so equality is
  // reliable regardless of how they sit in the live URL.
  const currentQuery = useMemo(() => {
    const out = new URLSearchParams();
    for (const key of [...paramKeys].sort()) {
      const value = searchParams.get(key);
      if (value != null && value !== '') out.set(key, value);
    }
    return out.toString();
  }, [paramKeys, searchParams]);

  const hasActiveFilters = currentQuery.length > 0;
  const activeView = views.find((v) => v.query === currentQuery) ?? null;

  const applyView = useCallback(
    (view: SavedView) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const key of paramKeys) params.delete(key);
      const incoming = new URLSearchParams(view.query);
      incoming.forEach((value, key) => params.set(key, value));
      const qs = params.toString();
      router.replace(qs ? `${pathname || '/'}?${qs}` : pathname || '/', { scroll: false });
    },
    [paramKeys, searchParams, router, pathname],
  );

  const saveView = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !surface) return;
      const filters = { query: currentQuery };
      const existing = views.find((v) => v.name.toLowerCase() === trimmed.toLowerCase());

      void (async () => {
        try {
          if (existing) {
            const json = await reqJson(`/api/saved-views/${existing.id}`, 'PATCH', {
              name: trimmed,
              filters,
            });
            const updated = json?.view
              ? toClientView(json.view as ServerView)
              : { ...existing, name: trimmed, query: currentQuery };
            setViews((prev) =>
              prev
                .filter(
                  (v) => v.id === existing.id || v.name.toLowerCase() !== trimmed.toLowerCase(),
                )
                .map((v) => (v.id === existing.id ? updated : v)),
            );
          } else {
            const json = await reqJson('/api/saved-views', 'POST', {
              surface,
              name: trimmed,
              filters,
            });
            if (json?.view) {
              const created = toClientView(json.view as ServerView);
              setViews((prev) => [
                ...prev.filter((v) => v.name.toLowerCase() !== trimmed.toLowerCase()),
                created,
              ]);
            }
          }
        } catch (err) {
          console.error('[useSavedViews] save failed:', err);
        }
      })();
    },
    [views, currentQuery, surface],
  );

  const removeView = useCallback(
    (id: string) => {
      if (!surface) return;
      const prev = views;
      setViews(prev.filter((v) => v.id !== id));
      void (async () => {
        try {
          await reqJson(`/api/saved-views/${id}`, 'DELETE');
        } catch (err) {
          console.error('[useSavedViews] remove failed:', err);
          setViews(prev);
        }
      })();
    },
    [views, surface],
  );

  return { views, currentQuery, activeView, hasActiveFilters, applyView, saveView, removeView };
}
