'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, ChevronDown, Loader2, X } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
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
  TransferSkippedRow,
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

function TransferTab({
  tab,
  label,
  fromSheet = [],
}: {
  tab: TransferTabState;
  label: string;
  /**
   * Rows the SHEET declined because this connector owns them. The sheet tab
   * says "these come in through the Ecwid connector, not the sheet" — without
   * routing them here, that sentence points at a tab that renders nothing, and
   * the operator has no way to confirm the claim.
   */
  fromSheet?: TransferSkippedRow[];
}) {
  const details = tab.details;
  const totalInserted = tab.inserted ?? details?.inserted.length ?? 0;
  const totalUpdated = tab.updated ?? details?.updated.length ?? 0;
  const totalDeleted = tab.deleted ?? details?.deleted.length ?? 0;
  const unknownTitles = details?.unknownTitle ?? [];
  const skippedRows = details?.skippedRows ?? [];
  const recoveredRows = details?.recoveredRows ?? [];
  // Blank padding is counted but never listed, so it is reported from stats.
  const blankRowCount = tab.stats?.skippedBlankRow ?? 0;

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

      {fromSheet.length > 0 && (
        <div className="rounded-xl border border-border-soft bg-surface-canvas/60 px-3 py-2.5">
          <p className={`${microBadge} text-text-soft`}>
            {fromSheet.length} row{fromSheet.length === 1 ? '' : 's'} in today’s sheet{' '}
            {fromSheet.length === 1 ? 'belongs' : 'belong'} here
          </p>
          <p className={`${fieldLabel} mt-0.5 normal-case tracking-normal text-text-soft`}>
            The sheet import skipped these because this connector owns them. They are listed here so
            the hand-off is visible on both sides — no action needed.
          </p>
          <ul className="mt-1.5 divide-y divide-border-hairline rounded-lg border border-border-hairline bg-surface-card">
            {fromSheet.map((row) => (
              <li key={`fs:${row.sheetRow}`} className="flex items-center gap-2 px-2.5 py-1.5">
                <span className="w-[76px] shrink-0">
                  {row.orderId ? (
                    <OrderIdChip value={row.orderId} display={getLast4(row.orderId)} />
                  ) : (
                    <span className="pl-1.5 font-mono text-role-micro text-text-faint">—</span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-role-caption text-text-muted">
                  {row.productTitle || <span className="text-text-faint">(no title)</span>}
                </span>
                <span className="w-16 shrink-0 truncate text-right text-role-micro uppercase tracking-wide text-text-soft">
                  {row.platform || '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recoveredRows.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
          <p className={`${microBadge} text-emerald-700`}>
            {recoveredRows.length} row{recoveredRows.length === 1 ? '' : 's'} recovered by listing title
          </p>
          <p className={`${fieldLabel} mt-0.5 normal-case tracking-normal text-emerald-700`}>
            The Item Number cell was blank, but the listing title matched an existing listing exactly —
            so these imported with their real listing id instead of being skipped.
          </p>
          <ul className="mt-1.5 divide-y divide-emerald-100 rounded-lg border border-emerald-100 bg-surface-card">
            {recoveredRows.map((row) => (
              <li key={`rec:${row.sheetRow}`} className="flex items-center gap-2 px-2.5 py-1.5">
                <span className="w-[76px] shrink-0">
                  {row.orderId ? (
                    <OrderIdChip value={row.orderId} display={getLast4(row.orderId)} />
                  ) : (
                    <span className="pl-1.5 font-mono text-role-micro text-text-faint">—</span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-role-caption text-text-muted">
                  {row.productTitle}
                </span>
                <span className="w-16 shrink-0 truncate text-right text-role-micro uppercase tracking-wide text-text-soft">
                  {row.platform || '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SkippedRowsPanel
        // Ecwid rows are excluded here and rendered on the Ecwid tab instead —
        // one home per row, so the two panels can never disagree about a count.
        rows={skippedRows.filter((row) => row.reason !== 'ecwid')}
        blankCount={blankRowCount}
        crossReferenced={skippedRows.filter((row) => row.reason === 'ecwid').length}
      />

      {tab.status === 'running' && noRows ? (
        <p className={`${fieldLabel} text-text-soft`}>Waiting for {label} to finish…</p>
      ) : noRows ? (
        // "Already up to date" is only true when nothing was DECLINED either.
        // It used to print unconditionally, so a run that read 46 rows and
        // skipped 34 of them reported itself as a clean no-op.
        <p className={`${fieldLabel} text-text-soft`}>
          {skippedRows.length > 0
            ? `No rows imported — every eligible row was already up to date, and ${skippedRows.length} were skipped (above).`
            : fromSheet.length > 0
              ? // Without this branch the Ecwid tab printed a bare "already up to
                // date" directly beneath a list of rows the sheet had just handed
                // it — two statements that read as contradicting each other.
                `No new ${label} orders — the ${fromSheet.length} row${fromSheet.length === 1 ? '' : 's'} above were already imported by this connector.`
              : 'No changes — already up to date.'}
        </p>
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

/**
 * How each skip reason is presented. Two axes matter to an operator:
 * whether the row is FIXABLE by editing the sheet, and how loud it should be.
 *
 * `ecwid` is deliberately quiet — those orders arrive through the Ecwid API, so
 * listing them as a problem sends someone to fix a cell that should stay empty.
 * `blankRow` never reaches here at all (counted, never listed).
 */
const SKIP_REASON_META: Record<
  TransferSkippedRow['reason'],
  { label: string; hint: string; tone: 'amber' | 'gray'; actionable: boolean }
> = {
  noItemNumber: {
    label: 'Missing Item Number',
    hint: 'Real orders with tracking — add the Item Number cell and re-import.',
    tone: 'amber',
    actionable: true,
  },
  noTracking: {
    label: 'Missing tracking',
    hint: 'Labels work needs a real shipment, so these wait for a tracking number.',
    tone: 'amber',
    actionable: true,
  },
  noOrderId: {
    label: 'Missing Order Number',
    hint: 'A row with content but no order number — usually a note or a partial entry.',
    tone: 'amber',
    actionable: true,
  },
  ecwid: {
    label: 'Ecwid (imported separately)',
    hint: 'Not a problem — these come in through the Ecwid connector, not the sheet.',
    tone: 'gray',
    actionable: false,
  },
  fbaShipment: {
    label: 'FBA inbound shipments',
    hint: 'Not sales — one row per box of an Amazon inbound shipment. Nothing to fix.',
    tone: 'gray',
    actionable: false,
  },
  blankRow: {
    label: 'Empty rows',
    hint: 'Spreadsheet padding.',
    tone: 'gray',
    actionable: false,
  },
};

/**
 * The rows the import DECLINED. Every other block in this dialog describes what
 * landed; on a live tab this is routinely the largest group, and before it
 * existed a run that skipped 34 of 46 rows rendered as "No changes — already up
 * to date."
 */
function SkippedRowsPanel({
  rows,
  blankCount,
  crossReferenced = 0,
}: {
  rows: TransferSkippedRow[];
  blankCount: number;
  /** Ecwid rows now listed on their own tab — summarized here, not re-listed. */
  crossReferenced?: number;
}) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0 && blankCount === 0) return null;

  const byReason = new Map<TransferSkippedRow['reason'], TransferSkippedRow[]>();
  for (const row of rows) {
    const list = byReason.get(row.reason) ?? [];
    list.push(row);
    byReason.set(row.reason, list);
  }

  // Actionable groups first, largest first — the operator's work queue order.
  const groups = Array.from(byReason.entries()).sort(([aR, aRows], [bR, bRows]) => {
    const aAct = SKIP_REASON_META[aR].actionable ? 0 : 1;
    const bAct = SKIP_REASON_META[bR].actionable ? 0 : 1;
    return aAct !== bAct ? aAct - bAct : bRows.length - aRows.length;
  });

  const actionable = rows.filter((r) => SKIP_REASON_META[r.reason].actionable).length;

  return (
    <div className="rounded-xl border border-border-soft bg-surface-canvas/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 inset-field text-left ${focusRing('control', 'accent')}`}
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 ${actionable > 0 ? 'text-amber-600' : 'text-text-faint'}`} />
          <span className={sectionLabel}>
            {rows.length} row{rows.length === 1 ? '' : 's'} skipped
            {actionable > 0 ? ` · ${actionable} need${actionable === 1 ? 's' : ''} a fix` : ''}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border-hairline inset-field">
          {groups.map(([reason, group]) => {
            const meta = SKIP_REASON_META[reason];
            return (
              <div key={reason}>
                <p
                  className={`${microBadge} ${meta.tone === 'amber' ? 'text-amber-700' : 'text-text-soft'}`}
                >
                  {group.length} · {meta.label}
                </p>
                <p className={`${fieldLabel} mt-0.5 normal-case tracking-normal text-text-soft`}>
                  {meta.hint}
                </p>
                <ul className="mt-1.5 divide-y divide-border-hairline rounded-lg border border-border-hairline bg-surface-card">
                  {group.map((row) => (
                    <li
                      key={`${row.reason}:${row.sheetRow}`}
                      className="flex items-center gap-2 px-2.5 py-1.5"
                    >
                      {/* Order → title → platform. The order number is the
                          identity the operator searches by, so it leads and
                          carries the house copy affordance (click = full id on
                          the clipboard) rather than being a dead mono string. */}
                      <span className="w-[76px] shrink-0">
                        {row.orderId ? (
                          <OrderIdChip value={row.orderId} display={getLast4(row.orderId)} />
                        ) : (
                          <span className="pl-1.5 font-mono text-role-micro text-text-faint">—</span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-role-caption text-text-muted">
                        {row.productTitle || <span className="text-text-faint">(no title)</span>}
                      </span>
                      <span className="w-16 shrink-0 truncate text-right text-role-micro uppercase tracking-wide text-text-soft">
                        {row.platform || '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {crossReferenced > 0 && (
            <p className={`${fieldLabel} text-text-soft normal-case tracking-normal`}>
              Plus {crossReferenced} Ecwid row{crossReferenced === 1 ? '' : 's'} — listed on the{' '}
              <span className="font-semibold">Ecwid Direct</span> tab, which owns them.
            </p>
          )}

          {blankCount > 0 && (
            <p className={`${fieldLabel} text-text-faint normal-case tracking-normal`}>
              Plus {blankCount} empty row{blankCount === 1 ? '' : 's'} (spreadsheet padding) — nothing to fix.
            </p>
          )}
        </div>
      )}
    </div>
  );
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

/**
 * Order import progress — non-modal RightRailHost occupant (`detail:order-sync`).
 * Same float metric as Add Order / order inspector; Cancel is the only intentional
 * abort while a transfer is in flight (Escape / X / Close no-op until done).
 */
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

  // Ecwid rows the SHEET declined belong to the Ecwid tab, not the sheet's skip
  // list. Cross-referencing them here is what makes "these come in through the
  // Ecwid connector" a checkable claim instead of a dead pointer.
  const ecwidRowsFromSheet = useMemo(
    () => (sheets.details?.skippedRows ?? []).filter((row) => row.reason === 'ecwid'),
    [sheets.details?.skippedRows],
  );

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
        // Include the rows handed over from the sheet, or the tab reads as
        // empty on exactly the runs where it has something to say.
        count:
          (ecwid.details?.inserted.length ?? ecwid.inserted ?? 0) +
          (ecwid.details?.updated.length ?? ecwid.updated ?? 0) +
          ecwidRowsFromSheet.length,
        color: 'emerald' as const,
      },
      {
        id: 'exceptions' as const,
        label: 'Resolved Exceptions',
        count: exceptions.resolved?.length ?? exceptions.matched ?? 0,
        color: 'gray' as const,
      },
    ],
    [sheets, ecwid, exceptions, ecwidRowsFromSheet.length],
  );

  // Block dismiss while a transfer is in flight; Cancel is the only intentional abort.
  const handleClose = () => {
    if (!isRunning) onClose();
  };

  if (!open) return null;

  return (
    <DetailStackRailRegistrar
      id="detail:order-sync"
      onClose={handleClose}
      modal={false}
      ariaLabel="Order import progress"
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card"
        data-testid="order-sync-panel"
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
                <TransferTab tab={ecwid} label="Ecwid Direct" fromSheet={ecwidRowsFromSheet} />
              ) : (
                <ExceptionsTab tab={exceptions} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border-soft bg-surface-canvas px-5 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              {statusDot(sheets.status)} <span>{statusLabel(sheets.status, sheets.summary)}</span>
            </span>
            <span className="text-text-faint">·</span>
            <span className="inline-flex items-center gap-1.5">
              {statusDot(ecwid.status)} <span>{statusLabel(ecwid.status, ecwid.summary)}</span>
            </span>
            <span className="text-text-faint">·</span>
            <span className="inline-flex items-center gap-1.5">
              {statusDot(exceptions.status)}{' '}
              <span>{statusLabel(exceptions.status, exceptions.summary)}</span>
            </span>
          </div>
          <Button variant="brand" size="sm" onClick={handleClose} disabled={isRunning}>
            {isRunning ? 'Running…' : 'Close'}
          </Button>
        </footer>
      </div>
    </DetailStackRailRegistrar>
  );
}
