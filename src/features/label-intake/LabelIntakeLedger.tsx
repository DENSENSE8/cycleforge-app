'use client';

/** Label intake — the V1 outbound label-ingestion ledger (desk and `/m` alike). */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/utils/_cn';
import {
  applyLabelIngestionHttp,
  LABEL_INGESTIONS_QUERY_KEY,
  listLabelIngestionsHttp,
  retryLabelIngestionHttp,
  uploadLabelPdf,
  type LabelIngestionDto,
} from '@/lib/label-ingestions/http-client';
import {
  LEDGER_ACTION_LABEL,
  LEDGER_VIEW_LABEL,
  LEDGER_VIEWS,
  ledgerStatus,
  ledgerViewRows,
  quarantineCopy,
  type LedgerTone,
  type LedgerView,
} from '@/lib/label-ingestions/ledger-view';

const SPINE: Record<LedgerTone, string> = {
  danger: 'bg-fill-danger',
  warning: 'bg-fill-warning',
  info: 'bg-fill-info',
  fulfillment: 'bg-fill-fulfillment',
  success: 'bg-fill-success',
};
const STATE_TEXT: Record<LedgerTone, string> = {
  danger: 'text-text-danger',
  warning: 'text-text-warning',
  info: 'text-text-info',
  fulfillment: 'text-text-fulfillment',
  success: 'text-text-success',
};

const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const DAY = new Intl.DateTimeFormat(undefined, { month: '2-digit', day: '2-digit' });

function observedLabel(iso: string): string {
  const at = new Date(iso);
  const sameDay = at.toDateString() === new Date().toDateString();
  return sameDay ? TIME.format(at) : `${DAY.format(at)} ${TIME.format(at).slice(0, 5)}`;
}

function orderReference(row: LabelIngestionDto): string | null {
  if (!row.marketplaceOrderId) return null;
  return row.accountSource ? `${row.accountSource.toUpperCase()} · ${row.marketplaceOrderId}` : row.marketplaceOrderId;
}

const recordId = (id: number) => `#${String(id).padStart(5, '0')}`;
/** `SHIPSTATION_API` → `Shipstation api`; the label voice uppercases it on the floor. */
const sentenceCode = (code: string) => {
  const words = code.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const CELL = 'flex min-h-11 items-center border-r border-border-hairline px-3';
/** The region's label voice (`mode-label`): mono caps on the floor, sans sentence case on a desk. */
const LABEL = 'mode-label font-semibold';

export function LabelIntakeLedger() {
  const queryClient = useQueryClient();
  const picker = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<LedgerView>('needs-action');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState('Drop a label PDF, or upload one.');
  const [dragging, setDragging] = useState(false);

  const query = useQuery({
    queryKey: LABEL_INGESTIONS_QUERY_KEY,
    queryFn: listLabelIngestionsHttp,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const visible = useMemo(() => ledgerViewRows(rows, view), [rows, view]);
  const counts = useMemo(
    () => Object.fromEntries(LEDGER_VIEWS.map((id) => [id, ledgerViewRows(rows, id).length])) as Record<LedgerView, number>,
    [rows],
  );
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  // Select (and optionally open) a record only AFTER the refetch lands, so the
  // record is in the view when the selection effect below inspects it.
  const settle = useCallback(
    async (id: number, message: string, open = false) => {
      setNotice(message);
      await queryClient.invalidateQueries({ queryKey: LABEL_INGESTIONS_QUERY_KEY });
      setSelectedId(id);
      if (open) setSheetOpen(true);
    },
    [queryClient],
  );
  const failed = (error: unknown) => setNotice(error instanceof Error ? error.message : 'Request failed.');

  const upload = useMutation({
    mutationFn: uploadLabelPdf,
    onSuccess: ({ data, replayed }) => {
      setView('all');
      return settle(
        data.id,
        replayed
          ? `${recordId(data.id)} — these exact bytes were already ingested. Nothing was duplicated.`
          : `${recordId(data.id)} — ${ledgerStatus(data.state).label}.`,
        true,
      );
    },
    onError: failed,
  });
  const retry = useMutation({
    mutationFn: (row: LabelIngestionDto) => retryLabelIngestionHttp(row.id),
    onSuccess: (data) => settle(data.id, `${recordId(data.id)} reprocessed — ${ledgerStatus(data.state).label}.`),
    onError: failed,
  });
  const apply = useMutation({
    mutationFn: (row: LabelIngestionDto) => applyLabelIngestionHttp(row.id, row.rowVersion),
    onSuccess: (_data, row) => settle(row.id, `${recordId(row.id)} applied — packed units are now labeled.`),
    onError: async (error) => {
      failed(error);
      await queryClient.invalidateQueries({ queryKey: LABEL_INGESTIONS_QUERY_KEY });
    },
  });
  const pending = upload.isPending || retry.isPending || apply.isPending;

  // Desk placement keeps a record selected; the sheet placement opens only on an explicit tap, so a phone lands on the queue, not on a…
  useEffect(() => {
    if (selectedId != null && visible.some((row) => row.id === selectedId)) return;
    setSelectedId(visible[0]?.id ?? null);
    setSheetOpen(false);
  }, [visible, selectedId]);

  const submitFile = (file: File | undefined) => {
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') {
      setNotice('Only PDF labels can be ingested.');
      return;
    }
    upload.mutate(file);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    submitFile(event.dataTransfer.files?.[0]);
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = visible.findIndex((row) => row.id === selectedId);
    const next = visible[Math.min(visible.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    setSelectedId(next.id);
    list.current?.querySelector<HTMLElement>(`[data-record="${next.id}"]`)?.focus();
  };

  const status = selected ? ledgerStatus(selected.state) : null;
  const actionRunning = retry.isPending || apply.isPending;

  return (
    <section
      aria-label="Label intake"
      className={cn(
        '@container relative flex h-full min-h-0 w-full flex-col bg-surface-canvas text-text-default',
        dragging && 'outline outline-2 -outline-offset-2 outline-border-strong',
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* Command strip — one flush band, cells split by hairlines. */}
      <div className="flex shrink-0 flex-wrap items-stretch border-b border-border-strong bg-surface-card">
        <input
          ref={picker}
          className="sr-only"
          type="file"
          accept="application/pdf"
          tabIndex={-1}
          aria-label="Label PDF"
          onChange={(event) => {
            submitFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => picker.current?.click()}
          className={cn(CELL, LABEL, 'bg-surface-inverse text-text-inverse hover:bg-surface-inverse-hover disabled:opacity-60')}
        >
          {upload.isPending ? 'Ingesting…' : 'Upload label PDF'}
        </button>
        <button
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          className={cn(CELL, LABEL, 'hover:bg-surface-hover disabled:text-text-faint')}
        >
          {query.isFetching ? 'Syncing' : 'Refresh'}
        </button>
        <output aria-live="polite" className={cn(CELL, 'min-w-0 flex-1 border-r-0 text-role-caption text-text-soft')}>
          <span className="truncate">{query.isError ? 'The ledger could not be read. Refresh to retry.' : notice}</span>
        </output>
      </div>

      {/* Saved views — flat, flush, counted. */}
      <nav aria-label="Label intake views" className="flex shrink-0 items-stretch border-b border-border-strong bg-surface-card">
        {LEDGER_VIEWS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => setView(id)}
            className={cn(
              CELL,
              LABEL,
              'gap-2',
              view === id ? 'bg-surface-inverse text-text-inverse' : 'text-text-soft hover:bg-surface-hover',
            )}
          >
            {LEDGER_VIEW_LABEL[id]}
            <span className="tabular-nums">{String(counts[id]).padStart(2, '0')}</span>
          </button>
        ))}
      </nav>

      <div className="grid min-h-0 flex-1 grid-cols-1 @5xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Queue */}
        <div
          ref={list}
          role="listbox"
          aria-label="Label ingestions"
          aria-activedescendant={selectedId != null ? `label-record-${selectedId}` : undefined}
          onKeyDown={onListKey}
          className="min-h-0 overflow-y-auto overscroll-contain bg-surface-card"
        >
          {visible.map((row) => {
            const rowStatus = ledgerStatus(row.state);
            const reference = orderReference(row);
            const reason = quarantineCopy(row.quarantineReasonCode, row.trackingNumberNormalized != null);
            const isSelected = row.id === selectedId;
            return (
              <button
                key={row.id}
                id={`label-record-${row.id}`}
                data-record={row.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  setSelectedId(row.id);
                  setSheetOpen(true);
                }}
                className={cn(
                  'grid w-full grid-cols-[4px_3rem_minmax(0,1fr)] border-b border-border-default text-left',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-strong',
                  isSelected ? 'bg-surface-hover shadow-[inset_4px_0_0_var(--ds-color-border-strong)]' : 'hover:bg-surface-hover',
                )}
              >
                <span aria-hidden className={SPINE[rowStatus.tone]} />
                <span
                  aria-hidden
                  className={cn(LABEL, 'grid place-items-center border-r border-border-hairline bg-surface-sunken text-text-soft')}
                >
                  {(row.carrier ?? 'PDF').slice(0, 4)}
                </span>
                <span className="grid min-w-0 py-1.5">
                  <span className="flex min-w-0 items-center gap-3 px-3">
                    <span className={cn(LABEL, 'shrink-0 font-bold', STATE_TEXT[rowStatus.tone])}>{rowStatus.label}</span>
                    <span className={cn(LABEL, 'min-w-0 flex-1 truncate text-text-faint')}>
                      {sentenceCode(row.source)}
                      {row.carrier ? ` // ${row.carrier}` : ''}
                    </span>
                    <time dateTime={row.observedAt} className={cn(LABEL, 'shrink-0 tabular-nums text-text-soft')}>
                      {observedLabel(row.observedAt)}
                    </time>
                  </span>
                  <span className="flex min-w-0 items-baseline gap-3 px-3">
                    <strong className="min-w-0 flex-1 truncate text-role-body font-semibold">
                      {reference ?? row.fileBasename}
                    </strong>
                    <span className="shrink-0 font-sans text-role-caption tabular-nums text-text-soft industrial:font-mono">{recordId(row.id)}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-3 px-3">
                    {row.trackingNumberNormalized ? (
                      <code className="shrink-0 font-mono text-role-caption text-text-default">{row.trackingNumberNormalized}</code>
                    ) : (
                      <span className="shrink-0 font-sans text-role-caption text-text-default industrial:font-mono industrial:uppercase">
                        No tracking
                      </span>
                    )}
                    <span className={cn('min-w-0 flex-1 truncate text-role-caption', reason ? 'text-text-danger' : 'text-text-soft')}>
                      {reason ?? (row.matchMethod ? row.matchMethod.replace(/_/g, ' ').toLowerCase() : reference ? '' : row.fileBasename)}
                    </span>
                    <code className="hidden shrink-0 font-mono text-role-micro text-text-faint @2xl:inline">{row.sha256.slice(0, 12)}</code>
                  </span>
                </span>
              </button>
            );
          })}
          {!visible.length && (
            <div className="grid min-h-60 place-content-center gap-2 border-b border-border-default px-6 text-center">
              <strong className={cn(LABEL, 'font-bold')}>
                {query.isPending ? 'Reading ledger' : `No ${LEDGER_VIEW_LABEL[view].toLowerCase()}`}
              </strong>
              {!query.isPending && (
                <span className="text-role-caption text-text-soft">
                  {view === 'needs-action' ? 'Every ingested label is applied or still processing.' : 'Upload or drop a label PDF to start.'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Evidence — a fixed column on a wide container, a bottom sheet on a narrow one. */}
        <aside
          aria-label="Selected label evidence"
          className={cn(
            'fixed inset-x-0 bottom-0 z-40 max-h-[75dvh] flex-col border-t-2 border-border-strong bg-surface-card',
            '@5xl:static @5xl:z-auto @5xl:flex @5xl:max-h-none @5xl:min-h-0 @5xl:border-t-0 @5xl:border-l @5xl:border-l-border-strong',
            sheetOpen && selected ? 'flex' : 'hidden',
          )}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setSheetOpen(false);
          }}
        >
          {selected && status ? (
            <>
              <header className="flex shrink-0 items-stretch border-b border-border-strong">
                <div className="grid min-w-0 flex-1 gap-0.5 px-4 py-3">
                  <span className={cn(LABEL, 'text-text-soft')}>Label ingestion</span>
                  <strong className="font-sans text-role-title tabular-nums industrial:font-mono">{recordId(selected.id)}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className={cn(LABEL, 'border-l border-border-hairline px-4 hover:bg-surface-hover @5xl:hidden')}
                >
                  Close
                </button>
              </header>
              <div className={cn('flex shrink-0 items-center gap-2 border-b border-border-default px-4 py-2', LABEL, 'font-bold')}>
                <span aria-hidden className={cn('size-2', SPINE[status.tone])} />
                <span className={STATE_TEXT[status.tone]}>{status.label}</span>
              </div>
              <dl className="min-h-0 flex-1 overflow-y-auto">
                {(
                  [
                    ['Order', orderReference(selected) ?? 'No exact order'],
                    ['Quarantine', quarantineCopy(selected.quarantineReasonCode, selected.trackingNumberNormalized != null) ?? 'None'],
                    ['Tracking', selected.trackingNumberNormalized ?? 'Not detected'],
                    ['Carrier', selected.carrier ?? '—'],
                    ['Match', selected.matchMethod?.replace(/_/g, ' ') ?? 'Exact match pending'],
                    ['File', `${selected.fileBasename} · ${(selected.byteSize / 1024).toFixed(1)} KB`],
                    ['Observed', new Date(selected.observedAt).toLocaleString()],
                    ['Applied', selected.appliedAt ? new Date(selected.appliedAt).toLocaleString() : '—'],
                    ['Row version', String(selected.rowVersion)],
                    ['SHA-256', selected.sha256],
                  ] as const
                ).map(([term, value]) => (
                  <div key={term} className="grid gap-0.5 border-b border-border-hairline px-4 py-2">
                    <dt className={cn(LABEL, 'text-text-faint')}>{term}</dt>
                    <dd
                      className={cn(
                        'text-role-caption',
                        term === 'Tracking' || term === 'SHA-256' ? 'font-mono' : 'font-sans industrial:font-mono',
                        term === 'SHA-256' ? 'break-all' : 'break-words',
                      )}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <footer className="shrink-0 border-t border-border-strong">
                {status.action ? (
                  <button
                    type="button"
                    disabled={actionRunning}
                    onClick={() => (status.action === 'apply' ? apply.mutate(selected) : retry.mutate(selected))}
                    className={cn(
                      LABEL,
                      'min-h-12 w-full bg-surface-inverse font-bold text-text-inverse hover:bg-surface-inverse-hover disabled:opacity-60',
                    )}
                  >
                    {actionRunning ? 'Working…' : LEDGER_ACTION_LABEL[status.action]}
                  </button>
                ) : (
                  <p className={cn(LABEL, 'px-4 py-3 text-text-soft')}>
                    {selected.state === 'APPLIED' ? 'Applied — no action remains.' : 'Processing — no action yet.'}
                  </p>
                )}
              </footer>
            </>
          ) : (
            <p className={cn(LABEL, 'px-4 py-6 text-text-soft')}>Select a label record to inspect its evidence.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
