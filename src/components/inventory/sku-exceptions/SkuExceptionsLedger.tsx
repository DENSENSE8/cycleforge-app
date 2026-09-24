'use client';

/**
 * Inventory › **SKU Exceptions** — the floor-minted placeholder SKUs
 * (`TMP-<barcode>`) as an industrial record ledger with a triage evidence
 * column (HANDOFF-industrial-record-ledger; BRIEF §3 exception triage).
 *
 *   spine │ photo │ HLD · BIN <locations> · BARCODE ·························│ SEP 24
 *         │       │ title ··················································│ QTY [n]
 *         │       │ SKU TMP-… · PHOTOS n · ■ creator · description ········│ → next
 *   ────────────────────────────────────────────────────────────── │ evidence
 *
 * - `?q=` is the find box, answered client-side over every fact the record
 *   paints — the feed is one row per open placeholder, so the whole set is on
 *   the client.
 * - `?sku=TMP-…` opens that record in the evidence column. That URL is the
 *   share link (phones are rewritten to `/m/on-hold`). A `?sku=` that no longer
 *   resolves says why — already paired, with a link to the real product.
 * - Live: {@link useSkuExceptionsRealtime} refetches the list and the open
 *   record whenever the phone (or another desk) mints, edits, counts or pairs.
 */

import { memo, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { SearchField } from '@/design-system/primitives';
import { RecordLedger } from '@/design-system/components/record-ledger/RecordLedger';
import {
  IndustrialRecord,
  RecordBin,
  RecordIdFact,
  RecordNext,
  RecordPhoto,
  RecordQty,
  RecordStamp,
  RecordStateCode,
  RecordTitle,
} from '@/design-system/components/record-ledger/IndustrialRecord';
import { RECORD_LOCATION_CLASS } from '@/design-system/components/record-ledger/record-ledger-geometry';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import {
  useProvisionalSku,
  useProvisionalSkus,
  useSkuExceptionsRealtime,
} from '@/hooks/useProvisionalSkus';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import { photoContentUrl } from '@/lib/photos/display-url';
import { SKU_EXCEPTIONS_PATH } from '@/lib/inventory/sku-exception-links';
import { INVENTORY_SKU_EXCEPTIONS_ROUTE_PARAMS } from '@/lib/routing/query-mode-routes';
import { parseRouteParams } from '@/lib/routing/route-params';
import { cn } from '@/utils/_cn';
import {
  skuExceptionLocationFaces,
  skuExceptionMatches,
  skuExceptionNextStep,
  skuExceptionTitle,
} from './sku-exception-record';
import { SkuExceptionEvidence } from './SkuExceptionEvidence';

const recordKey = (row: ProvisionalSku) => row.sku;

export function SkuExceptionsLedger() {
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
  const openRecord = useCallback((sku: string) => replace((params) => params.set('sku', sku)), [replace]);
  const closeRecord = useCallback(() => replace((params) => params.delete('sku')), [replace]);

  const { value: query, setValue: setQuery } = useOptimisticUrlParam<string>({
    urlValue: searchParams.get('q') ?? '',
    replace,
    write: (params, next) => {
      if (next.trim()) params.set('q', next);
      else params.delete('q');
    },
  });

  const shown = useMemo(() => rows.filter((row) => skuExceptionMatches(row, query)), [rows, query]);

  const renderRecord = useCallback(
    (row: ProvisionalSku, open: boolean) => <SkuExceptionRecord row={row} open={open} onOpen={openRecord} />,
    [openRecord],
  );

  return (
    <RecordLedger
      testId="sku-exceptions-ledger"
      label="SKU exceptions"
      records={shown}
      recordKey={recordKey}
      renderRecord={renderRecord}
      openKey={selectedSku}
      onOpenKey={openRecord}
      onClose={closeRecord}
      loading={list.isLoading}
      toolbar={
        <>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search title, SKU, barcode, description or location…"
            className="min-w-0 max-w-[28rem] flex-1 overflow-hidden rounded-none pl-2"
            tone="neutral"
            hideUnderline
            fillHost
          />
          <span className={cn(RECORD_LABEL_CLASS, 'ml-auto flex items-center px-3 tabular-nums text-mode-muted')}>
            {query.trim() ? `${shown.length} of ${rows.length}` : `${rows.length}`} on hold
          </span>
        </>
      }
      banner={
        list.isError ? (
          <div
            role="alert"
            data-testid="sku-exceptions-error"
            className={cn(RECORD_LABEL_CLASS, 'border-b border-mode-rule bg-mode-well px-3 py-2 text-mode-warn')}
          >
            {list.error instanceof Error ? list.error.message : 'Could not load SKU exceptions.'}
          </div>
        ) : null
      }
      empty={
        query.trim() ? (
          <>
            <b className="text-role-body font-bold text-mode-ink">No SKU exception matches “{query.trim()}”</b>
            <button
              type="button"
              onClick={() => setQuery('')}
              className={cn(RECORD_LABEL_CLASS, 'underline underline-offset-2 text-mode-ink')}
            >
              Clear search
            </button>
          </>
        ) : (
          <>
            <b className="text-role-body font-bold text-mode-ink">No SKU exceptions</b>
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Every scanned product is paired</span>
          </>
        )
      }
      evidenceNoun="exception"
      evidence={
        <SkuExceptionEvidence
          sku={selectedSku}
          item={record.data}
          loading={record.isLoading}
          error={record.isError ? record.error : null}
          mergedInto={record.mergedInto}
          rows={rows}
          onExit={closeRecord}
        />
      }
    />
  );
}

const SkuExceptionRecord = memo(function SkuExceptionRecord({
  row,
  open,
  onOpen,
}: {
  row: ProvisionalSku;
  open: boolean;
  onOpen: (sku: string) => void;
}) {
  const title = skuExceptionTitle(row);
  const next = skuExceptionNextStep(row);
  const created = row.createdAt ? new Date(row.createdAt) : null;
  const createdValid = created && !Number.isNaN(created.getTime()) ? created : null;
  const description = (row.description ?? '').trim();

  return (
    <IndustrialRecord
      recordKey={row.sku}
      state="onHold"
      open={open}
      openLabel={`SKU exception ${row.sku}, on hold, ${title}`}
      onOpen={() => onOpen(row.sku)}
      photo={
        <RecordPhoto src={row.coverPhotoId != null ? photoContentUrl(row.coverPhotoId, 'thumb') : null} fallback={title} />
      }
      bands={[
        {
          main: (
            <>
              <RecordStateCode state="onHold" />
              <RecordBin faces={skuExceptionLocationFaces(row)} className={RECORD_LOCATION_CLASS} />
              <RecordIdFact label="Barcode" value={row.barcode} />
            </>
          ),
          right: (
            <RecordStamp title={createdValid ? format(createdValid, 'MMM d, yyyy · h:mm a') : undefined}>
              {createdValid ? format(createdValid, 'MMM d').toUpperCase() : null}
            </RecordStamp>
          ),
        },
        { main: <RecordTitle>{title}</RecordTitle>, right: <RecordQty value={row.stock} /> },
        {
          main: (
            <>
              <RecordIdFact label="SKU" value={row.sku} className="w-44 shrink-0" />
              <span
                className={cn(
                  RECORD_LABEL_CLASS,
                  'w-20 shrink-0',
                  row.photoCount === 0 ? 'text-mode-warn' : 'text-mode-muted',
                )}
              >
                {row.photoCount === 0 ? 'No photo' : `Photos ${row.photoCount}`}
              </span>
              <span className="inline-flex w-32 shrink-0 items-center gap-1.5">
                <StaffAvatar
                  staffId={row.createdByStaffId}
                  name={row.createdByName}
                  size="xs"
                  shape="square"
                />
                <span className={cn(RECORD_LABEL_CLASS, 'truncate text-mode-muted')}>
                  {row.createdByName ?? '—'}
                </span>
              </span>
              <span className="min-w-0 flex-1 truncate text-role-data text-mode-muted" title={description || undefined}>
                {description}
              </span>
            </>
          ),
          right: <RecordNext label={next} warn={next === 'Photo'} />,
        },
      ]}
    />
  );
});
