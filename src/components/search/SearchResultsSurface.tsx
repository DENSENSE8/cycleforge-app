'use client';

/**
 * SearchResultsSurface — the shared results body for Dashboard Search mode.
 * Controlled: the host owns the query (URL state); the surface owns retrieval
 * + grouped result rendering. No category pill strip — one unscoped retrieve.
 */

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Search, Loader2 } from '@/components/Icons';
import { AiQuickJumpResults } from '@/components/search/AiQuickJumpResults';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import type { NearMatchPackout } from '@/hooks/useNearMatchPackout';
import { cn } from '@/utils/_cn';
import { CATEGORY_TABS } from './search-tabs';

export interface SearchResultsSurfaceProps {
  query: string;
  /** Kept for call-site compatibility; only `global` is used. */
  scope?: 'global';
  /**
   * Row click. Receives the event so a host can intercept the `<Link>`.
   * When absent, rows navigate to their deep-link normally.
   */
  onSelectHit?: (hit: AiSearchHit, event: ReactMouseEvent) => void;
  /** Fires when the in-flight state changes. */
  onLoadingChange?: (loading: boolean) => void;
  /**
   * Fires with the current result set each time a query settles, so a host can
   * react to the hits (sole ORDER → Search order detail).
   */
  onResults?: (hits: AiSearchHit[]) => void;
  /** Highlighted order id — the rep workbench rail's current selection. */
  activeHitId?: number | null;
  /** Per-order packout proof for the rail rows (rep workbench only). */
  packoutById?: Record<number, NearMatchPackout>;
  className?: string;
}

interface FetchState {
  status: 'idle' | 'loading' | 'done' | 'forbidden' | 'error';
  hits: AiSearchHit[];
  usedSemantic: boolean;
  forKey: string;
}

const GROUPS = CATEGORY_TABS.filter((t) => t.id !== 'all');

export function SearchResultsSurface({
  query,
  onSelectHit,
  onLoadingChange,
  onResults,
  activeHitId,
  packoutById,
  className,
}: SearchResultsSurfaceProps) {
  const q = query.trim();
  const [state, setState] = useState<FetchState>({
    status: 'idle',
    hits: [],
    usedSemantic: false,
    forKey: '',
  });
  const abortRef = useRef<AbortController | null>(null);
  const pageContext = '/dashboard?mode=search';

  // One unscoped retrieve per query — cross-entity page, grouped in the UI.
  useEffect(() => {
    const key = q;
    if (!q || q.length < 2) {
      setState({ status: 'idle', hits: [], usedSemantic: false, forKey: key });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((prev) => ({ ...prev, status: 'loading', forKey: key }));

    fetch('/api/ai/retrieve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: q,
        limit: 50,
        pageContext,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (controller.signal.aborted) return;
        if (res.status === 403) {
          setState({ status: 'forbidden', hits: [], usedSemantic: false, forKey: key });
          return;
        }
        if (!res.ok) throw new Error(`search failed (${res.status})`);
        const data = await res.json();
        setState({
          status: 'done',
          hits: data.hits ?? [],
          usedSemantic: Boolean(data.usedSemantic),
          forKey: key,
        });
      })
      .catch((err) => {
        if ((err as { name?: string }).name === 'AbortError') return;
        setState({ status: 'error', hits: [], usedSemantic: false, forKey: key });
      });
  }, [q]);

  useEffect(() => {
    onLoadingChange?.(state.status === 'loading');
  }, [state.status, onLoadingChange]);
  useEffect(() => () => onLoadingChange?.(false), [onLoadingChange]);

  useEffect(() => {
    if (state.status === 'done') onResults?.(state.hits);
  }, [state.status, state.hits, onResults]);

  const grouped = useMemo(() => {
    const byType = new Map<string, AiSearchHit[]>();
    for (const hit of state.hits) {
      const list = byType.get(hit.entityType) ?? [];
      list.push(hit);
      byType.set(hit.entityType, list);
    }
    return GROUPS.map((t) => ({ id: t.id as string, label: t.label, hits: byType.get(t.id) ?? [] })).filter(
      (g) => g.hits.length > 0,
    );
  }, [state.hits]);

  const showResults = state.status === 'done' && state.hits.length > 0;

  return (
    <div className={cn('space-y-4', className)}>
      {state.status === 'done' && (
        <p className="text-role-caption font-medium text-text-soft">
          {state.hits.length === 50 ? '50+' : state.hits.length} result
          {state.hits.length === 1 ? '' : 's'} for “{q}”
          {state.usedSemantic ? ' · semantic + keyword' : ' · keyword'}
        </p>
      )}

      {!q && (
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-10 text-center">
          <Search className="mx-auto mb-2 h-6 w-6 text-text-faint" />
          <p className="text-sm font-semibold text-text-muted">Search everything, from anywhere</p>
          <p className="text-role-caption font-medium text-text-soft">
            Orders, serial units, receiving cartons, SKUs, repairs and FBA shipments — one query.
          </p>
        </div>
      )}
      {state.status === 'loading' && !showResults && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-text-soft">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching…
        </div>
      )}
      {state.status === 'forbidden' && (
        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption font-medium text-rose-700">
          Your role doesn’t include AI search yet — ask an admin to grant the “AI search
          retrieval” permission.
        </div>
      )}
      {state.status === 'error' && (
        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption font-medium text-rose-700">
          Search failed — try again.
        </div>
      )}
      {state.status === 'done' && state.hits.length === 0 && q && (
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center text-role-caption font-medium text-text-soft">
          No matches for “{q}”. Try fewer words, a partial serial, or the last 8 digits of a
          tracking number.
        </div>
      )}

      {showResults && (
        <div className="space-y-4 pb-8">
          {grouped.map((group) => (
            <section key={group.id} className="rounded-xl border border-border-hairline bg-surface-card">
              <div className="flex items-center justify-between border-b border-border-hairline px-3 py-2">
                <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
                  {group.label}
                  <span className="ml-1.5 rounded bg-surface-sunken px-1.5 py-0.5 text-text-soft">
                    {group.hits.length}
                  </span>
                </p>
              </div>
              <AiQuickJumpResults
                hits={group.hits}
                onNavigate={onSelectHit}
                activeId={activeHitId}
                packoutById={packoutById}
                density="comfortable"
                className="[&>p]:hidden"
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
