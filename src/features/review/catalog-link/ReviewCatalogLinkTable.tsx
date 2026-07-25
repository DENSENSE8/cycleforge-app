'use client';

/**
 * Review · Catalog link — listings imported with an Item Number that did not
 * match sku_catalog / sku_platform_ids. Link once to a Zoho/catalog SoT to
 * backfill all matching orders.
 */

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Link2, Loader2, Search, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
  WorkbenchChromeHeader,
} from '@/components/dashboard/workbench-shell';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { fieldLabel, sectionLabel } from '@/design-system/tokens/typography/presets';
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';

interface CatalogSearchRow {
  id: number;
  sku: string;
  product_title: string | null;
}

async function fetchChores(q: string): Promise<{ items: CatalogLinkChoreRow[]; total: number }> {
  const params = new URLSearchParams({ limit: '100' });
  if (q.trim()) params.set('q', q.trim());
  const res = await fetch(`/api/review/catalog-link?${params}`, { credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(body.error || 'Failed to load catalog-link queue');
  return { items: body.items || [], total: Number(body.total || 0) };
}

export function ReviewCatalogLinkTable() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const searchQuery = String(searchParams.get('search') || '').trim();
  const selectedId = Number(searchParams.get('choreId')) || null;

  const listQuery = useQuery({
    queryKey: ['review-catalog-link', searchQuery],
    queryFn: () => fetchChores(searchQuery),
  });

  const items = listQuery.data?.items ?? [];
  const selected = items.find((r) => r.id === selectedId) ?? null;

  const openChore = useCallback(
    (id: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('choreId', String(id));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const clearSelection = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('choreId');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const clearSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['review-catalog-link'] });
  }, [queryClient]);

  return (
    <div className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-surface-canvas">
      <DashboardScrollShell
        className="h-full"
        chrome={
          <div className={WORKBENCH_CHROME_COLUMN}>
            <WorkbenchChromeHeader
              tabs={[{ id: 'catalog-link', label: 'Needs catalog link' }]}
              activeTab="catalog-link"
              onTabChange={() => undefined}
            />
          </div>
        }
      >
        <div className={`${WORKBENCH_BODY_COLUMN} flex h-[calc(100dvh-8rem)] min-h-[24rem] gap-3 pb-3`}>
          <div className="min-w-0 flex-1 overflow-auto rounded-xl border border-border-soft bg-surface-card">
            {listQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className={fieldLabel}>Loading…</span>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
                <Check className="h-5 w-5 text-emerald-600" />
                <p className={sectionLabel}>No open catalog-link chores</p>
                <p className={`${fieldLabel} text-text-muted max-w-sm`}>
                  New sheet imports with an Item Number that does not match the catalog land here.
                </p>
                {searchQuery ? (
                  <Button type="button" variant="ghost" size="sm" onClick={clearSearch}>
                    Clear search
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="divide-y divide-border-soft">
                {items.map((row) => {
                  const active = row.id === selectedId;
                  return (
                    <li key={row.id}>
                      {/* ds-raw-button: full-width queue row (title + meta), not Button chrome */}
                      <button
                        type="button"
                        onClick={() => openChore(row.id)}
                        className={`ds-raw-button flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${focusRing('control', 'neutral')} ${
                          active ? 'bg-surface-sunken' : 'hover:bg-surface-sunken/60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-text-default">
                            {row.productTitle || 'Untitled listing'}
                          </p>
                          <p className={`${fieldLabel} text-text-muted truncate`}>
                            {row.itemNumber}
                            {row.accountSource ? ` · ${row.accountSource}` : ''}
                            {row.sku ? ` · ${row.sku}` : ''}
                          </p>
                        </div>
                        <span className={`${fieldLabel} shrink-0 tabular-nums text-text-muted`}>
                          {row.orderCount} order{row.orderCount === 1 ? '' : 's'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="w-full max-w-md shrink-0 overflow-auto rounded-xl border border-border-soft bg-surface-card">
            {selected ? (
              <CatalogLinkDetail
                chore={selected}
                onClose={clearSelection}
                onDone={() => {
                  clearSelection();
                  refresh();
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-text-muted">
                <Link2 className="h-5 w-5 opacity-50" />
                <p className={fieldLabel}>Select a listing to link to the catalog</p>
              </div>
            )}
          </div>
        </div>
      </DashboardScrollShell>
    </div>
  );
}

function CatalogLinkDetail({
  chore,
  onClose,
  onDone,
}: {
  chore: CatalogLinkChoreRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState(chore.productTitle?.split(/\s+/).slice(0, 3).join(' ') || '');
  const [results, setResults] = useState<CatalogSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CatalogSearchRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuery(chore.productTitle?.split(/\s+/).slice(0, 3).join(' ') || '');
    setSelected(null);
    setError(null);
  }, [chore.id, chore.productTitle]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/sku-catalog/search?q=${encodeURIComponent(term)}&searchField=zoho_catalog&limit=20`,
          { credentials: 'same-origin' },
        );
        const body = await res.json();
        if (!cancelled && body.success) setResults(body.items || []);
      } catch {
        /* best-effort */
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  const submitLink = async () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/review/catalog-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'link',
          choreId: chore.id,
          skuCatalogId: selected.id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || 'Link failed');
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Link failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitIgnore = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/review/catalog-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'ignore', choreId: chore.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || 'Ignore failed');
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ignore failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-2 border-b border-border-soft px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className={sectionLabel}>Link to catalog</p>
          <p className="truncate text-sm font-semibold text-text-default">
            {chore.productTitle || chore.itemNumber}
          </p>
          <p className={`${fieldLabel} text-text-muted`}>
            {chore.itemNumber}
            {chore.accountSource ? ` · ${chore.accountSource}` : ''}
            {' · '}
            {chore.orderCount} order{chore.orderCount === 1 ? '' : 's'}
          </p>
        </div>
        <IconButton
          type="button"
          ariaLabel="Close"
          onClick={onClose}
          icon={<X className="h-3.5 w-3.5" />}
        />
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        <div className="flex items-center gap-2 rounded-xl border border-border-soft bg-surface-sunken px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Zoho / catalog SKU or title…"
            className={`min-w-0 flex-1 bg-transparent text-sm text-text-default outline-none ${focusRing('control', 'neutral')}`}
          />
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" /> : null}
        </div>

        <ul className="max-h-64 space-y-1 overflow-auto">
          {results.map((row) => {
            const active = selected?.id === row.id;
            return (
              <li key={row.id}>
                {/* ds-raw-button: catalog search pick row, not Button chrome */}
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  className={`ds-raw-button flex w-full flex-col rounded-lg px-3 py-2 text-left ${focusRing('control', 'neutral')} ${
                    active ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'hover:bg-surface-sunken'
                  }`}
                >
                  <span className="text-sm font-semibold text-text-default">{row.sku}</span>
                  <span className={`${fieldLabel} text-text-muted truncate`}>
                    {row.product_title || 'Untitled'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className={fieldLabel}>{error}</p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-soft px-4 py-3">
        <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={() => void submitIgnore()}>
          Ignore
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!selected || submitting}
          onClick={() => void submitLink()}
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          Link listing
        </Button>
      </div>
    </div>
  );
}
