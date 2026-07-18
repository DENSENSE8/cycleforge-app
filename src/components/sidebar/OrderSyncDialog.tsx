'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Loader2, X } from '@/components/Icons';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button, IconButton } from '@/design-system/primitives';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { sectionLabel, fieldLabel, microBadge, dataValue } from '@/design-system/tokens/typography/presets';
import { TrackingChip, OrderIdChip, SkuScanRefChip, getLast4 } from '@/components/ui/CopyChip';
import type {
  ExceptionsTabState,
  OrderExceptionResolutionDetail,
  SyncTaskStatus,
  TransferOrderDetail,
  TransferTabState,
} from '@/lib/orders-sync/types';

interface OrderSyncDialogProps {
  open: boolean;
  onClose: () => void;
  isRunning: boolean;
  elapsedMs: number;
  onCancel?: () => void;
  sheets: TransferTabState;
  ecwid: TransferTabState;
  exceptions: ExceptionsTabState;
}

type TabId = 'sheets' | 'ecwid' | 'exceptions';

function statusDot(status: SyncTaskStatus) {
  if (status === 'running') return <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />;
  if (status === 'done') return <Check className="w-3.5 h-3.5 text-emerald-600" />;
  if (status === 'error') return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
  return <span className="block w-2 h-2 rounded-full bg-surface-strong" />;
}

function statusLabel(status: SyncTaskStatus, summary?: string) {
  if (status === 'running') return 'Running…';
  if (status === 'done') return summary || 'Done';
  if (status === 'error') return summary || 'Error';
  return summary || 'Queued';
}

function badge(kind: 'inserted' | 'updated' | 'deleted' | 'unknown' | 'resolved' | 'open') {
  const map: Record<string, string> = {
    inserted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    updated: 'bg-blue-50 text-blue-700 ring-blue-200',
    deleted: 'bg-surface-canvas text-text-muted ring-border-soft',
    unknown: 'bg-amber-50 text-amber-700 ring-amber-200',
    resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    open: 'bg-red-50 text-red-700 ring-red-200',
  };
  return `inline-flex items-center rounded-md inset-chip text-role-micro font-semibold uppercase tracking-wide ring-1 ring-inset ${map[kind]}`;
}

function TransferTab({ tab, label }: { tab: TransferTabState; label: string }) {
  const details = tab.details;
  const totalInserted = tab.inserted ?? details?.inserted.length ?? 0;
  const totalUpdated = tab.updated ?? details?.updated.length ?? 0;
  const totalDeleted = tab.deleted ?? details?.deleted.length ?? 0;
  const unknownTitles = details?.unknownTitle ?? [];

  if (tab.status === 'idle') {
    return (
      <div className="flex h-full flex-col items-center justify-center py-12 text-text-faint">
        <p className={fieldLabel}>{label} sync hasn’t started yet.</p>
      </div>
    );
  }

  if (tab.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50/60 px-4 py-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-4 h-4" />
          <span className={sectionLabel}>{label} failed</span>
        </div>
        <p className={`${fieldLabel} text-red-700`}>{tab.error || tab.summary || 'Unknown error.'}</p>
      </div>
    );
  }

  const noRows = !details || (
    totalInserted === 0 && totalUpdated === 0 && totalDeleted === 0
  );

  // Rollup: when updates dominate, show *where* those existing orders
  // originally came from. Answers "why is everything updated instead of
  // inserted?" — usually it's because Ecwid or a prior sheet run already
  // brought them in.
  const updateProvenance = (() => {
    const updated = details?.updated ?? [];
    if (updated.length === 0 || totalInserted >= updated.length) return null;
    const bySource = new Map<string, number>();
    for (const row of updated) {
      const key = (row.existingAccountSource || 'unknown').toLowerCase();
      bySource.set(key, (bySource.get(key) ?? 0) + 1);
    }
    const sorted = Array.from(bySource.entries()).sort((a, b) => b[1] - a[1]);
    return sorted;
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <SummaryStat label="Inserted" value={totalInserted} tone="emerald" />
        <SummaryStat label="Updated" value={totalUpdated} tone="blue" />
        <SummaryStat label="Removed duplicates" value={totalDeleted} tone="gray" />
      </div>

      {updateProvenance && updateProvenance.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2.5">
          <p className={`${microBadge} text-blue-700`}>Why so many updates?</p>
          <p className={`${fieldLabel} text-blue-700 mt-0.5 normal-case tracking-normal`}>
            These orders already existed in the database — the sheet only filled in blanks. Originally inserted by:{' '}
            {updateProvenance.map(([src, n], i) => (
              <span key={src}>
                {i > 0 ? ', ' : ''}
                <span className="font-semibold">{src}</span> ({n})
              </span>
            ))}
            .
          </p>
        </div>
      )}

      {unknownTitles.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
          <p className={`${microBadge} text-amber-700`}>
            {unknownTitles.length} row{unknownTitles.length === 1 ? '' : 's'} still missing a product title
          </p>
          <p className={`${fieldLabel} text-amber-700 mt-0.5`}>
            These will appear as “Unknown Product” in the dashboard until the SKU is added to the catalog.
          </p>
        </div>
      )}

      {tab.status === 'running' && noRows ? (
        <p className={`${fieldLabel} text-text-soft`}>Waiting for {label} to finish…</p>
      ) : noRows ? (
        <p className={`${fieldLabel} text-text-soft`}>No changes — already up to date.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-soft">
          <DetailTable
            rows={[
              ...(details?.inserted ?? []).map((r) => ({ kind: 'inserted' as const, row: r })),
              ...(details?.updated ?? []).map((r) => ({ kind: 'updated' as const, row: r })),
              ...(details?.deleted ?? []).map((r) => ({ kind: 'deleted' as const, row: r })),
            ]}
          />
        </div>
      )}
    </div>
  );
}

function ExceptionsTab({ tab }: { tab: ExceptionsTabState }) {
  if (tab.status === 'idle') {
    return (
      <div className="flex h-full flex-col items-center justify-center py-12 text-text-faint">
        <p className={fieldLabel}>Exceptions sync runs after Google Sheets and Ecwid finish.</p>
      </div>
    );
  }

  if (tab.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50/60 px-4 py-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-4 h-4" />
          <span className={sectionLabel}>Exceptions sync failed</span>
        </div>
        <p className={`${fieldLabel} text-red-700`}>{tab.error || tab.summary || 'Unknown error.'}</p>
      </div>
    );
  }

  const resolved = tab.resolved ?? [];
  const stillOpen = tab.stillOpen ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <SummaryStat label="Resolved" value={resolved.length || (tab.matched ?? 0)} tone="emerald" />
        <SummaryStat label="Still open" value={stillOpen.length} tone="red" />
      </div>

      {resolved.length === 0 && stillOpen.length === 0 ? (
        <p className={`${fieldLabel} text-text-soft`}>
          {tab.status === 'running' ? 'Looking for matches…' : 'No open exceptions to process.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-soft">
          <ExceptionTable resolved={resolved} stillOpen={stillOpen} />
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'blue' | 'gray' | 'red' }) {
  const toneMap = {
    emerald: 'border-emerald-200 bg-emerald-50/60 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50/60 text-blue-700',
    gray: 'border-border-soft bg-surface-canvas/60 text-text-muted',
    red: 'border-red-200 bg-red-50/60 text-red-700',
  } as const;
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneMap[tone]}`}>
      <p className={`${microBadge}`}>{label}</p>
      <p className={`${dataValue} mt-0.5 tabular-nums text-xl`}>{value}</p>
    </div>
  );
}

function formatExistingProvenance(row: TransferOrderDetail): string | null {
  const src = row.existingAccountSource?.trim();
  const at = row.existingCreatedAt ? new Date(row.existingCreatedAt) : null;
  const datePart = at && !Number.isNaN(at.getTime())
    ? at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  if (src && datePart) return `from ${src} · ${datePart}`;
  if (src) return `from ${src}`;
  if (datePart) return `first seen ${datePart}`;
  return null;
}

function DetailTable({
  rows,
}: {
  rows: Array<{ kind: 'inserted' | 'updated' | 'deleted'; row: TransferOrderDetail }>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="max-h-[40vh] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-surface-canvas text-left shadow-[0_1px_0_0_rgb(229_231_235)]">
          <tr className="text-role-micro uppercase tracking-wide text-text-soft">
            <th className="inset-field font-semibold">Order</th>
            <th className="inset-field font-semibold">Product</th>
            <th className="inset-field font-semibold">SKU</th>
            <th className="inset-field font-semibold">Tracking</th>
            <th className="inset-field font-semibold text-right">Kind</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-hairline">
          {rows.map(({ kind, row }, i) => {
            const provenance = kind !== 'inserted' ? formatExistingProvenance(row) : null;
            return (
              <tr key={`${kind}:${row.orderId}:${i}`} className="hover:bg-surface-canvas/60">
                <td className="inset-field align-top">
                  {row.orderId ? (
                    <OrderIdChip value={row.orderId} display={getLast4(row.orderId)} />
                  ) : (
                    <span className="font-mono text-xs text-text-faint">—</span>
                  )}
                  {provenance ? (
                    <div className="mt-0.5 pl-1.5 text-role-micro font-normal text-text-faint">{provenance}</div>
                  ) : null}
                </td>
                <td className="inset-field text-text-muted align-top">
                  {row.productTitle || (
                    <span className="text-amber-700">Unknown Product</span>
                  )}
                  {row.titleSource && row.titleSource !== 'sheet' && row.productTitle ? (
                    <span className="ml-1 text-role-micro uppercase tracking-wide text-text-faint">
                      · {row.titleSource.replace('_', ' ')}
                    </span>
                  ) : null}
                </td>
                <td className="inset-field align-top">
                  {row.sku || row.itemNumber ? (
                    <SkuScanRefChip
                      value={(row.sku || row.itemNumber) as string}
                      display={getLast4(row.sku || row.itemNumber)}
                    />
                  ) : (
                    <span className="font-mono text-xs text-text-faint">—</span>
                  )}
                </td>
                <td className="inset-field align-top">
                  {row.tracking ? (
                    <TrackingChip value={row.tracking} display={getLast4(row.tracking)} />
                  ) : (
                    <span className="font-mono text-xs text-text-faint">—</span>
                  )}
                </td>
                <td className="inset-field text-right align-top">
                  <span className={badge(kind)}>{kind}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ExceptionTable({
  resolved,
  stillOpen,
}: {
  resolved: OrderExceptionResolutionDetail[];
  stillOpen: OrderExceptionResolutionDetail[];
}) {
  const rows = [
    ...resolved.map((row) => ({ kind: 'resolved' as const, row })),
    ...stillOpen.map((row) => ({ kind: 'open' as const, row })),
  ];
  return (
    <div className="max-h-[40vh] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-surface-canvas text-left shadow-[0_1px_0_0_rgb(229_231_235)]">
          <tr className="text-role-micro uppercase tracking-wide text-text-soft">
            <th className="inset-field font-semibold">Exception</th>
            <th className="inset-field font-semibold">Tracking</th>
            <th className="inset-field font-semibold">Source</th>
            <th className="inset-field font-semibold">Matched order</th>
            <th className="inset-field font-semibold text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-hairline">
          {rows.map(({ kind, row }) => (
            <tr key={`${kind}:${row.exceptionId}`} className="hover:bg-surface-canvas/60">
              <td className="inset-field font-mono text-xs text-text-default">#{row.exceptionId}</td>
              <td className="inset-field font-mono text-xs text-text-muted">{row.tracking || '—'}</td>
              <td className="inset-field text-xs text-text-muted">{row.sourceStation || '—'}</td>
              <td className="inset-field font-mono text-xs text-text-muted">
                {row.matchedOrderId != null ? `#${row.matchedOrderId}` : '—'}
              </td>
              <td className="inset-field text-right">
                <span className={badge(kind)}>{kind === 'resolved' ? 'resolved' : 'still open'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrderSyncDialog({
  open,
  onClose,
  isRunning,
  elapsedMs,
  onCancel,
  sheets,
  ecwid,
  exceptions,
}: OrderSyncDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('sheets');

  // Pill TabSwitch SoT — same solid/accent recipe as WorkbenchChromeHeader
  // (dashboard / Labels top-left). Per-source status stays in the footer.
  const switchTabs = useMemo(
    () => [
      {
        id: 'sheets' as const,
        label: 'Google Sheets',
        count:
          (sheets.details?.inserted.length ?? sheets.inserted ?? 0) +
          (sheets.details?.updated.length ?? sheets.updated ?? 0),
        color: 'blue' as const,
      },
      {
        id: 'ecwid' as const,
        label: 'Ecwid Direct',
        count:
          (ecwid.details?.inserted.length ?? ecwid.inserted ?? 0) +
          (ecwid.details?.updated.length ?? ecwid.updated ?? 0),
        color: 'emerald' as const,
      },
      {
        id: 'exceptions' as const,
        label: 'Resolved Exceptions',
        count: exceptions.resolved?.length ?? exceptions.matched ?? 0,
        color: 'gray' as const,
      },
    ],
    [sheets, ecwid, exceptions],
  );

  // Block dismiss while a transfer is in flight (backdrop + Escape); Cancel is
  // the only intentional abort. Same RightPaneOverlay shell as ReceivingClaimModal.
  const handleClose = () => {
    if (!isRunning) onClose();
  };

  return (
    <RightPaneOverlay
      open={open}
      onClose={handleClose}
      align="center"
      resizable
      storageKey="order-sync-dialog-size"
      minWidth={480}
      minHeight={360}
      closeOnEscape={!isRunning}
      className="-mt-8 h-[min(86vh,40rem)] w-[min(94vw,48rem)]"
      aria-label="Order sync"
    >
      <header className="flex shrink-0 items-start gap-3 border-b border-border-soft px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <p className={`${microBadge} text-text-soft`}>Order Sync</p>
          <h2 className={`${sectionLabel} mt-0.5 text-text-default`}>
            {isRunning ? 'Importing latest orders' : 'Import complete'}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <motion.span
            key={Math.floor(elapsedMs / 100)}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            className="text-role-caption font-mono font-semibold tabular-nums text-blue-600"
          >
            {(elapsedMs / 1000).toFixed(1)}s
          </motion.span>
          {isRunning && onCancel ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onCancel}
              className="bg-red-50 text-red-700 ring-inset ring-red-200 hover:bg-red-100"
            >
              Cancel
            </Button>
          ) : null}
          <IconButton
            icon={<X className="h-4 w-4" />}
            ariaLabel="Close"
            onClick={handleClose}
            disabled={isRunning}
            className="rounded-lg p-1.5 hover:bg-surface-sunken"
          />
        </div>
      </header>

      <div className="shrink-0 border-b border-border-soft px-4 py-2.5">
        <TabSwitch
          tabs={switchTabs}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as TabId)}
          variant="solid"
          solidTone="accent"
          countStyle="plain"
          className="w-full"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={framerTransition.overlayScrim}
          >
            {activeTab === 'sheets' ? (
              <TransferTab tab={sheets} label="Google Sheets" />
            ) : activeTab === 'ecwid' ? (
              <TransferTab tab={ecwid} label="Ecwid Direct" />
            ) : (
              <ExceptionsTab tab={exceptions} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border-soft bg-surface-canvas px-5 py-2.5">
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            {statusDot(sheets.status)} <span>{statusLabel(sheets.status, sheets.summary)}</span>
          </span>
          <span className="text-text-faint">·</span>
          <span className="inline-flex items-center gap-1.5">
            {statusDot(ecwid.status)} <span>{statusLabel(ecwid.status, ecwid.summary)}</span>
          </span>
          <span className="text-text-faint">·</span>
          <span className="inline-flex items-center gap-1.5">
            {statusDot(exceptions.status)} <span>{statusLabel(exceptions.status, exceptions.summary)}</span>
          </span>
        </div>
        <Button variant="brand" size="sm" onClick={handleClose} disabled={isRunning}>
          {isRunning ? 'Running…' : 'Close'}
        </Button>
      </footer>
    </RightPaneOverlay>
  );
}
