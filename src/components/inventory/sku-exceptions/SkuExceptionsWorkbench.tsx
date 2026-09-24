'use client';

/**
 * **SKU Exceptions** — the floor-minted placeholder SKU queue, on the ONE slot
 * table (`sku-exceptions` family), with the record walk the order-exceptions
 * desk established.
 *
 * - The TABLE is for triage across placeholders: `?q=` is the find box,
 *   answered client-side over every painted fact (title, SKU, barcode,
 *   description, location codes). The feed is one row per open placeholder,
 *   so the whole set is always on the client.
 * - `?sku=TMP-…` swaps the body for {@link SkuExceptionEditor} beside
 *   {@link SkuExceptionsRail}. That URL is the share link: a colleague opening
 *   it lands on the same record (phones are rewritten to `/m/on-hold`).
 * - A `?sku=` that no longer resolves says why — already paired, with a link to
 *   the real product — instead of silently painting the queue.
 *
 * Live: {@link useSkuExceptionsRealtime} invalidates the list and the open
 * record whenever the phone (or another desk) creates, edits, counts or pairs
 * a placeholder.
 */

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle } from '@/components/Icons';
import { DataTable, type DataTableSearch } from '@/components/tables/DataTable';
import { Button } from '@/design-system/primitives/Button';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import {
  useProvisionalSku,
  useProvisionalSkus,
  useSkuExceptionsRealtime,
} from '@/hooks/useProvisionalSkus';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import { SKU_EXCEPTIONS_PATH } from '@/lib/inventory/sku-exception-links';
import { INVENTORY_SKU_EXCEPTIONS_ROUTE_PARAMS } from '@/lib/routing/query-mode-routes';
import { parseRouteParams } from '@/lib/routing/route-params';
import { useSkuExceptionsSpreadsheet } from './useSkuExceptionsSpreadsheet';
import { SkuExceptionsRail } from './SkuExceptionsRail';
import { SkuExceptionEditor } from './SkuExceptionEditor';

export function SkuExceptionsWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useSkuExceptionsRealtime();

  const list = useProvisionalSkus();
  const rows = useMemo(() => list.data ?? [], [list.data]);
  const selectedSku = searchParams.get('sku')?.trim() || null;
  const record = useProvisionalSku(selectedSku);

  /** One writer for the params this surface owns, in the route's declared order. */
  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = parseRouteParams(INVENTORY_SKU_EXCEPTIONS_ROUTE_PARAMS, params).toString();
      router.replace(qs ? `${SKU_EXCEPTIONS_PATH}?${qs}` : SKU_EXCEPTIONS_PATH, { scroll: false });
    },
    [router, searchParams],
  );

  const openRecord = useCallback(
    (sku: string) => replace((params) => params.set('sku', sku)),
    [replace],
  );
  const closeRecord = useCallback(() => replace((params) => params.delete('sku')), [replace]);
  const openRow = useCallback((row: ProvisionalSku) => openRecord(row.sku), [openRecord]);

  const { value: query, setValue: setQuery } = useOptimisticUrlParam<string>({
    urlValue: searchParams.get('q') ?? '',
    replace,
    write: (params, next) => {
      if (next.trim()) params.set('q', next);
      else params.delete('q');
    },
  });

  const search = useMemo<DataTableSearch>(
    () => ({
      value: query,
      onChange: setQuery,
      placeholder: 'Search title, SKU, barcode, description or location…',
      answeredBy: 'client',
    }),
    [query, setQuery],
  );

  const sheet = useSkuExceptionsSpreadsheet({
    rows,
    search,
    loading: list.isLoading,
    onOpenRow: openRow,
    emptyMessage: 'No SKU exceptions — every scanned product is paired.',
  });

  /** Header verb: open the newest placeholder's record (or the one already picked). */
  const firstSku = rows[0]?.sku ?? null;
  const reviewControl = useMemo(
    () => (
      <DeskHeaderAction
        type="button"
        variant="primary"
        size="sm"
        disabled={!firstSku}
        onClick={() => {
          if (firstSku) openRecord(firstSku);
        }}
        data-testid="sku-exceptions-open-form"
      >
        Review
      </DeskHeaderAction>
    ),
    [firstSku, openRecord],
  );

  const queue = (
    <SkuExceptionsRail
      rows={rows}
      selectedSku={selectedSku}
      onSelect={openRecord}
      loading={list.isLoading}
    />
  );

  let body;
  if (selectedSku && record.data) {
    body = (
      <SkuExceptionEditor key={record.data.sku} item={record.data} queue={queue} onExit={closeRecord} />
    );
  } else if (selectedSku && !record.isLoading) {
    body = (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          role="status"
          className="flex items-center gap-2 border-b border-border-hairline bg-surface-card px-6 py-3 text-role-body text-text-default"
          data-testid="sku-exception-missing"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-text-soft" aria-hidden />
          {record.isError ? (
            <span className="min-w-0 flex-1">
              {record.error instanceof Error ? record.error.message : 'Could not load'}{' '}
              <span className="font-mono">{selectedSku}</span>.
            </span>
          ) : record.mergedInto ? (
            <span className="min-w-0 flex-1">
              <span className="font-mono">{selectedSku}</span> is already paired to{' '}
              <Link
                href={`/inventory/sku/${encodeURIComponent(record.mergedInto)}`}
                className="font-mono font-semibold text-accent underline-offset-2 hover:underline"
              >
                {record.mergedInto}
              </Link>
              .
            </span>
          ) : (
            <span className="min-w-0 flex-1">
              No SKU exception <span className="font-mono">{selectedSku}</span>.
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={closeRecord}>
            Back to the queue
          </Button>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="sku-exceptions-queue">
          <DataTable {...sheet} />
        </div>
      </div>
    );
  } else if (selectedSku) {
    body = (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-role-caption text-text-soft">Loading {selectedSku}…</p>
      </div>
    );
  } else {
    body = (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="sku-exceptions-queue">
        <DataTable {...sheet} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <DeskActionSlotRegistrar role="primary">{reviewControl}</DeskActionSlotRegistrar>
      {list.isError ? (
        <div
          className="border-b border-border-danger bg-surface-danger px-6 py-2 text-role-caption font-semibold text-text-danger"
          data-testid="sku-exceptions-error"
        >
          {list.error instanceof Error ? list.error.message : 'Could not load SKU exceptions.'}
        </div>
      ) : null}
      {body}
    </div>
  );
}
