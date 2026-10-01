'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { surfaceFromStorageKey } from '@/lib/saved-views/surfaces';

/** `useSavedViews` — the ONE storage + URL-apply core behind every generic saved-views surface (dashboard outbound + station/testing… */

export interface SavedView {
  id: string;
  name: string;
  /** Encoded subset of the view's params (stable key order). */
  query: string;
  /** Org-wide visibility. */
  isShared: boolean;
  /** True when the signed-in staffer owns this row (can edit/delete/share). */
  isMine: boolean;
}

export interface SaveViewOptions {
  isShared?: boolean;
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
  /** Clear every `paramKeys` key from the URL (idle board for this surface). */
  clearView: () => void;
  /** Save the current params under a name (replaces a same-name owned view). */
  saveView: (name: string, options?: SaveViewOptions) => void;
  /** Rename an owned view. Filters stay; only the label moves. */
  renameView: (id: string, name: string) => void;
  /** Toggle org-share on an owned view. */
  setViewShared: (id: string, isShared: boolean) => void;
  /** Delete a saved view by id (owner only). */
  removeView: (id: string) => void;
}

type ServerView = {
  id: number;
  name: string;
  filters: Record<string, unknown>;
  is_shared?: boolean;
  staff_id?: number;
};

function toClientView(row: ServerView, staffId: number | null): SavedView {
  const query = typeof row.filters?.query === 'string' ? row.filters.query : '';
  const ownerId = typeof row.staff_id === 'number' ? row.staff_id : null;
  return {
    id: String(row.id),
    name: row.name,
    query,
    isShared: row.is_shared === true,
    isMine: staffId != null && ownerId === staffId,
  };
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
  const { user } = useAuth();
  const staffId = user?.staffId ?? null;
  const surface = surfaceFromStorageKey(storageKey);

  const [views, setViews] = useState<SavedView[]>([]);

  useEffect(() => {
    if (!surface) {
      console.error(
        `[useSavedViews] no saved-views surface is mapped for storageKey "${storageKey}" — ` +
          'saved views are disabled here. Register it in src/lib/saved-views/surfaces.ts.',
      );
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
        if (!cancelled) setViews(rows.map((r) => toClientView(r, staffId)));
      } catch {
        if (!cancelled) setViews([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surface, storageKey, staffId]);

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

  const clearView = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of paramKeys) params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname || '/'}?${qs}` : pathname || '/', { scroll: false });
  }, [paramKeys, searchParams, router, pathname]);

  const saveView = useCallback(
    (name: string, options?: SaveViewOptions) => {
      const trimmed = name.trim();
      if (!trimmed || !surface) return;
      const filters: Record<string, unknown> = { query: currentQuery };
      const isShared = options?.isShared === true;
      const existing = views.find(
        (v) => v.isMine && v.name.toLowerCase() === trimmed.toLowerCase(),
      );

      void (async () => {
        try {
          if (existing) {
            const json = await reqJson(`/api/saved-views/${existing.id}`, 'PATCH', {
              name: trimmed,
              filters,
              isShared,
            });
            const updated = json?.view
              ? toClientView(json.view as ServerView, staffId)
              : {
                  ...existing,
                  name: trimmed,
                  query: currentQuery,
                  isShared,
                };
            setViews((prev) =>
              prev
                .filter(
                  (v) =>
                    v.id === existing.id ||
                    !(v.isMine && v.name.toLowerCase() === trimmed.toLowerCase()),
                )
                .map((v) => (v.id === existing.id ? updated : v)),
            );
          } else {
            const json = await reqJson('/api/saved-views', 'POST', {
              surface,
              name: trimmed,
              filters,
              isShared,
            });
            if (json?.view) {
              const created = toClientView(json.view as ServerView, staffId);
              setViews((prev) => [
                ...prev.filter(
                  (v) => !(v.isMine && v.name.toLowerCase() === trimmed.toLowerCase()),
                ),
                created,
              ]);
            }
          }
        } catch (err) {
          console.error('[useSavedViews] save failed:', err);
        }
      })();
    },
    [views, currentQuery, surface, staffId],
  );

  const renameView = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !surface) return;
      const target = views.find((v) => v.id === id);
      if (!target?.isMine) return;
      if (trimmed === target.name) return;
      const prevName = target.name;
      setViews((prev) => prev.map((v) => (v.id === id ? { ...v, name: trimmed } : v)));
      void (async () => {
        try {
          const json = await reqJson(`/api/saved-views/${id}`, 'PATCH', { name: trimmed });
          if (json?.view) {
            const updated = toClientView(json.view as ServerView, staffId);
            setViews((prev) => prev.map((v) => (v.id === id ? updated : v)));
          }
        } catch (err) {
          console.error('[useSavedViews] rename failed:', err);
          setViews((prev) => prev.map((v) => (v.id === id ? { ...v, name: prevName } : v)));
        }
      })();
    },
    [views, surface, staffId],
  );

  const setViewShared = useCallback(
    (id: string, isShared: boolean) => {
      if (!surface) return;
      const target = views.find((v) => v.id === id);
      if (!target?.isMine) return;
      setViews((prev) => prev.map((v) => (v.id === id ? { ...v, isShared } : v)));
      void (async () => {
        try {
          const json = await reqJson(`/api/saved-views/${id}`, 'PATCH', { isShared });
          if (json?.view) {
            const updated = toClientView(json.view as ServerView, staffId);
            setViews((prev) => prev.map((v) => (v.id === id ? updated : v)));
          }
        } catch (err) {
          console.error('[useSavedViews] share toggle failed:', err);
          setViews((prev) =>
            prev.map((v) => (v.id === id ? { ...v, isShared: target.isShared } : v)),
          );
        }
      })();
    },
    [views, surface, staffId],
  );

  const removeView = useCallback(
    (id: string) => {
      if (!surface) return;
      const target = views.find((v) => v.id === id);
      if (target && !target.isMine) return;
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

  return {
    views,
    currentQuery,
    activeView,
    hasActiveFilters,
    applyView,
    clearView,
    saveView,
    renameView,
    setViewShared,
    removeView,
  };
}
