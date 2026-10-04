'use client';

/**
 * One batched read per rendered document (`POST /api/tasks/doc-live`): every
 * reference token and ```tasks``` block on the page resolves together, and the
 * chips / blocks read the answer from context. P6 — the record is read at view
 * time, never copied into the doc. The request follows the text 350 ms behind,
 * so a live preview does not fire on every keystroke.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  DOC_LIVE_QUERIES_MAX,
  DOC_LIVE_REFS_MAX,
  docRefKey,
  docRefsIn,
  tasksBlockSources,
  type DocLivePayload,
  type DocLiveRequest,
  type DocRefFace,
  type DocTasksQueryResult,
} from '@/lib/tasks/doc-live';

export type DocSurface = 'desk' | 'phone';

interface DocLiveValue {
  /** Which app is painting — picks each record's door (SURFACE_LAW: a phone never follows a desk route). */
  surface: DocSurface;
  data: DocLivePayload | null;
  loading: boolean;
  error: string | null;
}

const DocLiveContext = createContext<DocLiveValue | null>(null);

const SETTLE_MS = 350;

export function DocLiveScope({ content, surface, children }: { content: string; surface: DocSurface; children: ReactNode }) {
  const request = useMemo<DocLiveRequest>(
    () => ({
      refs: docRefsIn(content).slice(0, DOC_LIVE_REFS_MAX),
      queries: [...new Set(tasksBlockSources(content))].slice(0, DOC_LIVE_QUERIES_MAX),
    }),
    [content],
  );
  const requestKey = useMemo(
    () => JSON.stringify([request.refs.map(docRefKey).sort(), [...request.queries].sort()]),
    [request],
  );
  const [settled, setSettled] = useState<{ key: string; request: DocLiveRequest }>({ key: requestKey, request });
  useEffect(() => {
    if (settled.key === requestKey) return;
    const timer = window.setTimeout(() => setSettled({ key: requestKey, request }), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [requestKey, request, settled.key]);

  const empty = settled.request.refs.length === 0 && settled.request.queries.length === 0;
  const query = useQuery({
    queryKey: ['tasks', 'doc-live', settled.key],
    enabled: !empty,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<DocLivePayload> => {
      const res = await fetch('/api/tasks/doc-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settled.request),
      });
      const data = (await res.json().catch(() => ({}))) as DocLivePayload & { error?: string };
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `Could not read the live records (${res.status})`);
      return data;
    },
  });

  const value = useMemo<DocLiveValue>(
    () => ({
      surface,
      data: query.data ?? null,
      loading: !empty && (query.isLoading || settled.key !== requestKey),
      error: query.error instanceof Error ? query.error.message : null,
    }),
    [surface, query.data, query.isLoading, query.error, empty, settled.key, requestKey],
  );
  return <DocLiveContext.Provider value={value}>{children}</DocLiveContext.Provider>;
}

/** The surface plus one reference's face: `undefined` while loading, `null` when it names nothing. */
export function useDocRefFace(key: string): { surface: DocSurface; face: DocRefFace | null | undefined } {
  const live = useContext(DocLiveContext);
  if (!live) return { surface: 'desk', face: null };
  const face = live.data?.refs[key];
  return { surface: live.surface, face: face === undefined && (live.loading || !live.data) ? undefined : face ?? null };
}

/** One ```tasks``` block's rows: `undefined` while loading. */
export function useDocTasksQuery(source: string): {
  surface: DocSurface;
  result: DocTasksQueryResult | undefined;
  error: string | null;
} {
  const live = useContext(DocLiveContext);
  if (!live) return { surface: 'desk', result: undefined, error: 'Task blocks render inside a task document.' };
  return { surface: live.surface, result: live.data?.queries[source.trim()], error: live.error };
}
