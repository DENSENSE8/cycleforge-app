'use client';

/**
 * Review · Catalog link — listings imported with an Item Number that did not
 * match sku_catalog / sku_platform_ids, plus the Missing item number tab for
 * sheet rows that never became orders (blank Item Number).
 */

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Link2, Loader2, Search, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
  WORKBENCH_TABLE_VIEWPORT_NO_KPI,
  WorkbenchChromeHeader,
} from '@/components/dashboard/workbench-shell';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { fieldLabel, sectionLabel } from '@/design-system/tokens/typography/presets';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { formatDateTimePST } from '@/utils/date';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';

type CatalogLinkSection = 'catalog-link' | 'missing-item-number';

const SECTION_TABS: Array<{ id: CatalogLinkSection; label: string }> = [
  { id: 'catalog-link', label: 'Needs catalog link' },
  { id: 'missing-item-number', label: 'Missing item number' },
];

function parseSection(raw: string | null): CatalogLinkSection {
  return raw === 'missing-item-number' ? 'missing-item-number' : 'catalog-link';
}

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

async function fetchExceptions(q: string): Promise<{ items: ImportExceptionRow[]; total: number }> {
  const params = new URLSearchParams({ limit: '100' });
  if (q.trim()) params.set('q', q.trim());
  const res = await fetch(`/api/review/import-exceptions?${params}`, { credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(body.error || 'Failed to load import exceptions');
  return { items: body.items || [], total: Number(body.total || 0) };
}

function SeenMeta({ firstSeenAt, lastSeenAt }: { firstSeenAt: string; lastSeenAt: string }) {
  return (
    <p className={`${fieldLabel} text-text-muted truncate`}>
      First {formatDateTimePST(firstSeenAt)}
      {' · '}
      Last {formatDateTimePST(lastSeenAt)}
    </p>
  );
}

export function ReviewCatalogLinkTable() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const searchQuery = String(searchParams.get('search') || '').trim();
  const section = parseSection(searchParams.get('section'));
  const selectedChoreId = Number(searchParams.get('choreId')) || null;
  const selectedExceptionId = Number(searchParams.get('exceptionId')) || null;

  const choresQuery = useQuery({
    queryKey: ['review-catalog-link', searchQuery],
    queryFn: () => fetchChores(searchQuery),
    enabled: section === 'catalog-link',
  });

  const exceptionsQuery = useQuery({
    queryKey: ['review-import-exceptions', searchQuery],
    queryFn: () => fetchExceptions(searchQuery),
    enabled: section === 'missing-item-number',
  });

  const choreItems = choresQuery.data?.items ?? [];
  const exceptionItems = exceptionsQuery.data?.items ?? [];
  const selectedChore = choreItems.find((r) => r.id === selectedChoreId) ?? null;
  const selectedException = exceptionItems.find((r) => r.id === selectedExceptionId) ?? null;

  const setSection = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'catalog-link') params.delete('section');
      else params.set('section', next);
      params.delete('choreId');
      params.delete('exceptionId');
      params.delete('search');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const openChore = useCallback(
    (id: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('choreId', String(id));
      params.delete('exceptionId');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const openException = useCallback(
    (id: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('exceptionId', String(id));
      params.delete('choreId');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const clearSelection = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('choreId');
    params.delete('exceptionId');
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
    void queryClient.invalidateQueries({ queryKey: ['review-import-exceptions'] });
  }, [queryClient]);

  const listLoading =
    section === 'catalog-link' ? choresQuery.isLoading : exceptionsQuery.isLoading;
  const listEmpty =
    section === 'catalog-link' ? choreItems.length === 0 : exceptionItems.length === 0;

  return (
    <div className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-surface-canvas">
      <DashboardScrollShell
        className="h-full"
        chrome={
          <div className={WORKBENCH_CHROME_COLUMN}>
            <WorkbenchChromeHeader
              density="band"
              tabs={SECTION_TABS}
              activeTab={section}
              onTabChange={setSection}
            />
          </div>
        }
      >
        <div className={`${WORKBENCH_BODY_COLUMN} ${WORKBENCH_TABLE_VIEWPORT_NO_KPI} flex gap-3 pb-3`}>
          <div className="min-w-0 flex-1 overflow-auto rounded-xl border border-border-soft bg-surface-card">
            {listLoading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className={fieldLabel}>Loading…</span>
              </div>
            ) : listEmpty ? (
              <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
                <Check className="h-5 w-5 text-emerald-600" />
                <p className={sectionLabel}>
                  {section === 'catalog-link'
                    ? 'No open catalog-link chores'
                    : 'No missing Item Number rows'}
                </p>
                <p className={`${fieldLabel} text-text-muted max-w-sm`}>
                  {section === 'catalog-link'
                    ? 'New sheet imports with an Item Number that does not match the catalog land here.'
                    : 'Sheet rows with a real order id and tracking but a blank Item Number land here after sync.'}
                </p>
                {searchQuery ? (
                  <Button type="button" variant="ghost" size="sm" onClick={clearSearch}>
                    Clear search
                  </Button>
                ) : null}
              </div>
            ) : section === 'catalog-link' ? (
              <ul className="divide-y divide-border-soft">
                {choreItems.map((row) => {
                  const active = row.id === selectedChoreId;
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
                          <SeenMeta firstSeenAt={row.firstSeenAt} lastSeenAt={row.lastSeenAt} />
                        </div>
                        <span className={`${fieldLabel} shrink-0 tabular-nums text-text-muted`}>
                          {row.orderCount} order{row.orderCount === 1 ? '' : 's'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="divide-y divide-border-soft">
                {exceptionItems.map((row) => {
                  const active = row.id === selectedExceptionId;
                  return (
                    <li key={row.id}>
                      {/* ds-raw-button: full-width queue row (title + meta), not Button chrome */}
                      <button
                        type="button"
                        onClick={() => openException(row.id)}
                        className={`ds-raw-button flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${focusRing('control', 'neutral')} ${
                          active ? 'bg-surface-sunken' : 'hover:bg-surface-sunken/60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-text-default">
                            {row.productTitle || row.accountOrderId || 'Untitled order'}
                          </p>
                          <p className={`${fieldLabel} text-text-muted truncate`}>
                            {row.accountOrderId}
                            {row.accountSource ? ` · ${row.accountSource}` : ''}
                            {row.tracking ? ` · ${row.tracking}` : ''}
                          </p>
                          <SeenMeta firstSeenAt={row.firstSeenAt} lastSeenAt={row.lastSeenAt} />
                        </div>
                        <span className={`${fieldLabel} shrink-0 tabular-nums text-text-muted`}>
                          ×{row.seenCount}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="w-full max-w-md shrink-0 overflow-auto rounded-xl border border-border-soft bg-surface-card">
            {section === 'catalog-link' ? (
              selectedChore ? (
                <CatalogLinkDetail
                  chore={selectedChore}
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
              )
            ) : selectedException ? (
              <ImportExceptionDetail
                row={selectedException}
                onClose={clearSelection}
                onDone={() => {
                  clearSelection();
                  refresh();
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-text-muted">
                <Search className="h-5 w-5 opacity-50" />
                <p className={fieldLabel}>Select a row to supply its Item Number</p>
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
          <SeenMeta firstSeenAt={chore.firstSeenAt} lastSeenAt={chore.lastSeenAt} />
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

function ImportExceptionDetail({
  row,
  onClose,
  onDone,
}: {
  row: ImportExceptionRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [itemNumber, setItemNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItemNumber('');
    setError(null);
  }, [row.id]);

  const submitResolve = async () => {
    const trimmed = itemNumber.trim();
    if (!trimmed) {
      setError('Item Number is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/review/import-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'resolve', id: row.id, itemNumber: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || 'Resolve failed');
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Resolve failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitIgnore = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/review/import-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'ignore', id: row.id }),
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
          <p className={sectionLabel}>Supply Item Number</p>
          <p className="truncate text-sm font-semibold text-text-default">
            {row.productTitle || row.accountOrderId}
          </p>
          <p className={`${fieldLabel} text-text-muted`}>
            {row.accountOrderId}
            {row.accountSource ? ` · ${row.accountSource}` : ''}
            {row.tracking ? ` · ${row.tracking}` : ''}
            {row.sheetRow != null ? ` · sheet row ${row.sheetRow}` : ''}
            {' · '}
            seen ×{row.seenCount}
          </p>
          <SeenMeta firstSeenAt={row.firstSeenAt} lastSeenAt={row.lastSeenAt} />
        </div>
        <IconButton
          type="button"
          ariaLabel="Close"
          onClick={onClose}
          icon={<X className="h-3.5 w-3.5" />}
        />
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        <label className="block space-y-1.5">
          <span className={fieldLabel}>Item Number</span>
          <input
            value={itemNumber}
            onChange={(e) => setItemNumber(e.target.value)}
            placeholder="eBay item # / ASIN / listing id…"
            autoFocus
            className={`w-full rounded-xl border border-border-soft bg-surface-sunken px-3 py-2 text-sm text-text-default outline-none ${focusRing('control', 'neutral')}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submitResolve();
              }
            }}
          />
        </label>
        <p className={`${fieldLabel} text-text-muted`}>
          Resolve re-runs the same sheet → order import path with this Item Number filled in.
        </p>

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
          disabled={!itemNumber.trim() || submitting}
          onClick={() => void submitResolve()}
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Resolve
        </Button>
      </div>
    </div>
  );
}
