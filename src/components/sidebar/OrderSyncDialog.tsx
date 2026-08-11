'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from '@/design-system/motion';
import { AlertTriangle, Check, ChevronDown, Loader2, X } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { TabDisplay } from '@/design-system/components/TabDisplay';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { Button, IconButton } from '@/design-system/primitives';
import { sectionLabel, fieldLabel, microBadge, dataValue } from '@/design-system/tokens/typography/presets';
import { TrackingChip, OrderIdChip, SkuScanRefChip, getLast8 } from '@/components/ui/CopyChip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { StackedRowIdentity } from '@/components/ui/StackedRowIdentity';
import { platformMetaIconTone, sourcePlatformMeta } from '@/lib/source-platform';
import type {
  ExceptionsTabState,
  OrderExceptionResolutionDetail,
  SyncTaskStatus,
  TransferOrderDetail,
  TransferSkippedRow,
  TransferTabState,
} from '@/lib/orders-sync/types';

/** Review · Missing item number — durable queue for blank Item Number sheet rows. */
const MISSING_ITEM_NUMBER_HREF =
  '/review?mode=catalog-link&section=missing-item-number';

type SyncBodyTab = 'orders' | 'exceptions';
type OrdersSourceTab = 'sheets' | 'ecwid';

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

const FLUSH = cornerClass('flush');

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
  return `inline-flex items-center ${FLUSH} inset-chip text-role-micro font-semibold uppercase tracking-wide ring-1 ring-inset ${map[kind]}`;
}

/** Long product titles wrap — same grammar as RailSelectionRoster. */
const SYNC_LIST_TITLE_CLASS =
  'min-w-0 w-full whitespace-normal break-words text-role-caption text-text-muted';

/**
 * Transfer / recovered / skipped list row — {@link StackedRowIdentity}: title
 * leads; order + tracking sit on the second line as typed CopyChips.
 * Channel face is {@link PlatformMark} (never typed platform prose).
 */
function SyncListRow({
  title,
  orderId,
  tracking,
  platform,
  trailing,
}: {
  title: ReactNode;
  orderId?: string | null;
  tracking?: string | null;
  /** Stored / sheet channel slug — paints {@link PlatformMark}, never uppercase text. */
  platform?: string | null;
  trailing?: ReactNode;
}) {
  const platformMeta = sourcePlatformMeta(platform);
  const platformLabel = platformMeta.value ? platformMeta.label : null;
  const iconTone = platformMeta.value ? platformMetaIconTone(platformMeta) : null;
  const channelTrailing = platform != null && String(platform).trim() !== ''
    ? <PlatformMark platformValue={platform} meta={platformMeta} />
    : platform === undefined
      ? null
      : <PlatformMark empty />;

  return (
    <li className="border-b border-border-hairline inset-field last:border-b-0">
      <StackedRowIdentity
        title={<p className={SYNC_LIST_TITLE_CLASS}>{title}</p>}
        keys={
          <>
            {orderId ? (
              <OrderIdChip
                value={orderId}
                display={getLast8(orderId)}
                dense
                platformLabel={platformLabel}
                iconClass={iconTone?.className}
                iconStyle={iconTone?.style}
              />
            ) : (
              <span className="font-mono text-role-micro text-text-faint">—</span>
            )}
            {tracking ? (
              <TrackingChip value={tracking} dense />
            ) : (
              <span className="font-mono text-role-micro text-text-faint">—</span>
            )}
          </>
        }
        trailing={trailing ?? channelTrailing}
      />
    </li>
  );
}

function TransferSection({
  tab,
  label,
  fromSheet = [],
  onResolveMissingItemNumbers,
}: {
  tab: TransferTabState;
  label: string;
  /**
   * Rows the SHEET declined because this connector owns them. Surfaced under
   * Ecwid so the hand-off is visible without a source switcher.
   */
  fromSheet?: TransferSkippedRow[];
  onResolveMissingItemNumbers?: () => void;
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
      <div className="flex flex-col items-center justify-center py-8 text-text-faint">
        <p className={fieldLabel}>{label} sync hasn’t started yet.</p>
      </div>
    );
  }

  if (tab.status === 'error') {
    return (
      <div className={`flex flex-col items-start gap-2 border border-red-200 bg-red-50/60 inset-field ${FLUSH}`}>
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
    <div className="flex flex-col gap-3">
      <div className={`grid grid-cols-3 divide-x divide-border-soft border-y border-border-soft ${FLUSH}`}>
        <SummaryStat label="Inserted" value={totalInserted} tone="emerald" />
        <SummaryStat label="Updated" value={totalUpdated} tone="blue" />
        <SummaryStat label="Removed duplicates" value={totalDeleted} tone="gray" />
      </div>

      {updateProvenance && updateProvenance.length > 0 && (
        <div className={`border-y border-blue-200 bg-blue-50/60 inset-field ${FLUSH}`}>
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
        <div className={`border-y border-amber-200 bg-amber-50/60 inset-field ${FLUSH}`}>
          <p className={`${microBadge} text-amber-700`}>
            {unknownTitles.length} row{unknownTitles.length === 1 ? '' : 's'} still missing a product title
          </p>
          <p className={`${fieldLabel} text-amber-700 mt-0.5`}>
            These will appear as “Unknown Product” in the dashboard until the SKU is added to the catalog.
          </p>
        </div>
      )}

      {fromSheet.length > 0 && (
        <div className={`border-y border-border-soft bg-surface-canvas/60 ${FLUSH}`}>
          <div className="inset-field pb-1.5 pt-2.5">
            <p className={`${microBadge} text-text-soft`}>
              {fromSheet.length} row{fromSheet.length === 1 ? '' : 's'} in today’s sheet{' '}
              {fromSheet.length === 1 ? 'belongs' : 'belong'} here
            </p>
            <p className={`${fieldLabel} mt-0.5 normal-case tracking-normal text-text-soft`}>
              The sheet import skipped these because this connector owns them. They are listed here so
              the hand-off is visible on both sides — no action needed.
            </p>
          </div>
          <ul className="border-t border-border-hairline bg-surface-card">
            {fromSheet.map((row) => (
              <SyncListRow
                key={`fs:${row.sheetRow}`}
                title={row.productTitle || <span className="text-text-faint">(no title)</span>}
                orderId={row.orderId}
                tracking={row.tracking}
                platform={row.platform}
              />
            ))}
          </ul>
        </div>
      )}

      {recoveredRows.length > 0 && (
        <div className={`border-y border-emerald-200 bg-emerald-50/60 ${FLUSH}`}>
          <div className="inset-field pb-1.5 pt-2.5">
            <p className={`${microBadge} text-emerald-700`}>
              {recoveredRows.length} row{recoveredRows.length === 1 ? '' : 's'} recovered by listing title
            </p>
            <p className={`${fieldLabel} mt-0.5 normal-case tracking-normal text-emerald-700`}>
              The Item Number cell was blank, but the listing title matched an existing listing exactly —
              so these imported with their real listing id instead of being skipped.
            </p>
          </div>
          <ul className="border-t border-emerald-100 bg-surface-card">
            {recoveredRows.map((row) => (
              <SyncListRow
                key={`rec:${row.sheetRow}`}
                title={row.productTitle}
                orderId={row.orderId}
                tracking={row.tracking}
                platform={row.platform}
              />
            ))}
          </ul>
        </div>
      )}

      {(skippedRows.filter((row) => row.reason !== 'ecwid').length > 0 || blankRowCount > 0) && (
        <SkippedRowsPanel
          // Ecwid rows are excluded here and rendered under Ecwid instead —
          // one home per row, so the two panels can never disagree about a count.
          rows={skippedRows.filter((row) => row.reason !== 'ecwid')}
          blankCount={blankRowCount}
          crossReferenced={skippedRows.filter((row) => row.reason === 'ecwid').length}
          onResolveMissingItemNumbers={onResolveMissingItemNumbers}
        />
      )}

      {tab.status === 'running' && noRows ? (
        <p className={`${fieldLabel} inset-field text-text-soft`}>Waiting for {label} to finish…</p>
      ) : noRows ? (
        // "Already up to date" is only true when nothing was DECLINED either.
        // It used to print unconditionally, so a run that read 46 rows and
        // skipped 34 of them reported itself as a clean no-op.
        <p className={`${fieldLabel} inset-field text-text-soft`}>
          {skippedRows.length > 0
            ? `No rows imported — every eligible row was already up to date, and ${skippedRows.length} were skipped (above).`
            : fromSheet.length > 0
              ? // Without this branch the Ecwid section printed a bare "already up to
                // date" directly beneath a list of rows the sheet had just handed
                // it — two statements that read as contradicting each other.
                `No new ${label} orders — the ${fromSheet.length} row${fromSheet.length === 1 ? '' : 's'} above were already imported by this connector.`
              : 'No changes — already up to date.'}
        </p>
      ) : (
        <div className={`overflow-hidden border-y border-border-soft ${FLUSH}`}>
          <DetailList
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

function ExceptionsSection({ tab }: { tab: ExceptionsTabState }) {
  if (tab.status === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-text-faint">
        <p className={fieldLabel}>Exceptions sync runs after Google Sheets and Ecwid finish.</p>
      </div>
    );
  }

  if (tab.status === 'error') {
    return (
      <div className={`flex flex-col items-start gap-2 border border-red-200 bg-red-50/60 inset-field ${FLUSH}`}>
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
    <div className="flex flex-col gap-3">
      <div className={`grid grid-cols-2 divide-x divide-border-soft border-y border-border-soft ${FLUSH}`}>
        <SummaryStat label="Resolved" value={resolved.length || (tab.matched ?? 0)} tone="emerald" />
        <SummaryStat label="Still open" value={stillOpen.length} tone="red" />
      </div>

      {resolved.length === 0 && stillOpen.length === 0 ? (
        <p className={`${fieldLabel} inset-field text-text-soft`}>
          {tab.status === 'running' ? 'Looking for matches…' : 'No open exceptions to process.'}
        </p>
      ) : (
        <div className={`overflow-hidden border-y border-border-soft ${FLUSH}`}>
          <ExceptionList resolved={resolved} stillOpen={stillOpen} />
        </div>
      )}
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'blue' | 'gray' | 'red' }) {
  const toneMap = {
    emerald: 'bg-emerald-50/60 text-emerald-700',
    blue: 'bg-blue-50/60 text-blue-700',
    gray: 'bg-surface-canvas/60 text-text-muted',
    red: 'bg-red-50/60 text-red-700',
  } as const;
  return (
    <div className={`inset-field py-2 ${toneMap[tone]}`}>
      <p className={`${microBadge}`}>{label}</p>
      <p className={`${dataValue} mt-0.5 tabular-nums text-lg`}>{value}</p>
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
    hint: 'Real orders with tracking — resolve them in Review · Missing item number (or fix the sheet cell and re-import).',
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
 * landed; on a live run this is routinely the largest group, and before it
 * existed a run that skipped 34 of 46 rows rendered as "No changes — already up
 * to date."
 */
function SkippedRowsPanel({
  rows,
  blankCount,
  crossReferenced = 0,
  onResolveMissingItemNumbers,
}: {
  rows: TransferSkippedRow[];
  blankCount: number;
  /** Ecwid rows now listed under Ecwid Direct — summarized here, not re-listed. */
  crossReferenced?: number;
  /** Opens Review · Missing item number for durable blank-Item-Number triage. */
  onResolveMissingItemNumbers?: () => void;
}) {
  const missingCount = rows.filter((r) => r.reason === 'noItemNumber').length;
  const actionable = rows.filter((r) => SKIP_REASON_META[r.reason].actionable).length;
  // Open by default when something needs a fix — the CTA is useless if buried.
  const [open, setOpen] = useState(true);

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

  return (
    <div className={`border-y border-border-soft bg-surface-canvas/60 ${FLUSH}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 inset-field py-2 text-left ${focusRing('control', 'accent')}`}
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className={`h-3.5 w-3.5 ${actionable > 0 ? 'text-amber-600' : 'text-text-faint'}`} />
          <span className={sectionLabel}>
            {rows.length} row{rows.length === 1 ? '' : 's'} skipped
            {actionable > 0 ? ` · ${actionable} need${actionable === 1 ? 's' : ''} a fix` : ''}
          </span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border-hairline pb-2.5">
          {missingCount > 0 && onResolveMissingItemNumbers ? (
            <div className="inset-field pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={onResolveMissingItemNumbers}
                className="h-7 w-full px-2.5 text-role-micro"
              >
                Resolve {missingCount} missing item number{missingCount === 1 ? '' : 's'}
              </Button>
            </div>
          ) : null}

          {groups.map(([reason, group]) => {
            const meta = SKIP_REASON_META[reason];
            return (
              <div key={reason}>
                <div className="inset-field pt-2">
                  <p
                    className={`${microBadge} ${meta.tone === 'amber' ? 'text-amber-700' : 'text-text-soft'}`}
                  >
                    {group.length} · {meta.label}
                  </p>
                  <p className={`${fieldLabel} mt-0.5 normal-case tracking-normal text-text-soft`}>
                    {meta.hint}
                  </p>
                </div>
                <ul className="mt-1.5 border-y border-border-hairline bg-surface-card">
                  {group.map((row) => (
                    <SyncListRow
                      key={`${row.reason}:${row.sheetRow}`}
                      title={row.productTitle || <span className="text-text-faint">(no title)</span>}
                      orderId={row.orderId}
                      tracking={row.tracking}
                      platform={row.platform}
                    />
                  ))}
                </ul>
              </div>
            );
          })}

          {crossReferenced > 0 && (
            <p className={`${fieldLabel} inset-field text-text-soft normal-case tracking-normal`}>
              Plus {crossReferenced} Ecwid row{crossReferenced === 1 ? '' : 's'} — listed on the{' '}
              <span className="font-semibold">Ecwid Direct</span> tab, which owns them.
            </p>
          )}

          {blankCount > 0 && (
            <p className={`${fieldLabel} inset-field text-text-faint normal-case tracking-normal`}>
              Plus {blankCount} empty row{blankCount === 1 ? '' : 's'} (spreadsheet padding) — nothing to fix.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DetailList({
  rows,
}: {
  rows: Array<{ kind: 'inserted' | 'updated' | 'deleted'; row: TransferOrderDetail }>;
}) {
  if (rows.length === 0) return null;
  return (
    <ul className="max-h-[40vh] overflow-y-auto bg-surface-card">
      {rows.map(({ kind, row }, i) => {
        const provenance = kind !== 'inserted' ? formatExistingProvenance(row) : null;
        const title = (
          <>
            {row.productTitle || <span className="text-amber-700">Unknown Product</span>}
            {row.titleSource && row.titleSource !== 'sheet' && row.productTitle ? (
              <span className="ml-1 text-role-micro uppercase tracking-wide text-text-faint">
                · {row.titleSource.replace('_', ' ')}
              </span>
            ) : null}
            {provenance ? (
              <span className="ml-1 text-role-micro font-normal text-text-faint">· {provenance}</span>
            ) : null}
          </>
        );
        return (
          <SyncListRow
            key={`${kind}:${row.orderId}:${i}`}
            title={title}
            orderId={row.orderId}
            tracking={row.tracking}
            trailing={
              <div className="flex flex-col items-end gap-1">
                <span className={badge(kind)}>{kind}</span>
                {row.sku || row.itemNumber ? (
                  <SkuScanRefChip
                    value={(row.sku || row.itemNumber) as string}
                    display={getLast8(row.sku || row.itemNumber)}
                    dense
                  />
                ) : null}
              </div>
            }
          />
        );
      })}
    </ul>
  );
}

function ExceptionList({
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
    <ul className="max-h-[40vh] overflow-y-auto bg-surface-card">
      {rows.map(({ kind, row }) => (
        <li
          key={`${kind}:${row.exceptionId}`}
          className="flex items-start gap-2 border-b border-border-hairline inset-field last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-role-caption text-text-muted">
              Exception #{row.exceptionId}
              {row.sourceStation ? (
                <span className="ml-1 text-role-micro uppercase tracking-wide text-text-faint">
                  · {row.sourceStation}
                </span>
              ) : null}
            </p>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              {row.tracking ? (
                <TrackingChip value={row.tracking} dense />
              ) : (
                <span className="font-mono text-role-micro text-text-faint">—</span>
              )}
              <span className="font-mono text-role-micro text-text-soft">
                {row.matchedOrderId != null ? `#${row.matchedOrderId}` : '—'}
              </span>
            </div>
          </div>
          <span className={badge(kind)}>{kind === 'resolved' ? 'resolved' : 'still open'}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Order import progress — non-modal RightRailHost occupant (`detail:order-sync`).
 * Flush edge-to-edge: parent underline **Orders** / **Exceptions**, child
 * segment **Google Sheets** / **Ecwid Direct** stacked under Orders (same
 * hierarchy as TicketDisplayHost Claim surface → ClaimWizardNav). Cancel is the
 * only intentional abort while a transfer is in flight.
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
  const router = useRouter();
  const [bodyTab, setBodyTab] = useState<SyncBodyTab>('orders');
  const [ordersSource, setOrdersSource] = useState<OrdersSourceTab>('sheets');

  // Ecwid rows the SHEET declined belong under Ecwid, not the sheet's skip
  // list. Cross-referencing them here is what makes "these come in through the
  // Ecwid connector" a checkable claim instead of a dead pointer.
  const ecwidRowsFromSheet = useMemo(
    () => (sheets.details?.skippedRows ?? []).filter((row) => row.reason === 'ecwid'),
    [sheets.details?.skippedRows],
  );

  const sheetsCount =
    (sheets.details?.inserted.length ?? sheets.inserted ?? 0) +
    (sheets.details?.updated.length ?? sheets.updated ?? 0);

  const ecwidCount =
    (ecwid.details?.inserted.length ?? ecwid.inserted ?? 0) +
    (ecwid.details?.updated.length ?? ecwid.updated ?? 0) +
    ecwidRowsFromSheet.length;

  const ordersCount = sheetsCount + ecwidCount;

  const exceptionsCount =
    (exceptions.resolved?.length ?? exceptions.matched ?? 0) +
    (exceptions.stillOpen?.length ?? 0);

  // Parent underline (Orders · Exceptions) + child segment (Sheets · Ecwid) —
  // same stacked hierarchy as TicketDisplayHost Claim → ClaimWizardNav.
  const parentTabs = useMemo(
    () => [
      { id: 'orders' as const, label: 'Orders', count: ordersCount },
      { id: 'exceptions' as const, label: 'Exceptions', count: exceptionsCount },
    ],
    [ordersCount, exceptionsCount],
  );

  const ordersChildTabs = useMemo(
    () => [
      { id: 'sheets' as const, label: 'Google Sheets', count: sheetsCount },
      { id: 'ecwid' as const, label: 'Ecwid Direct', count: ecwidCount },
    ],
    [sheetsCount, ecwidCount],
  );

  // Block dismiss while a transfer is in flight; Cancel is the only intentional abort.
  const handleClose = () => {
    if (!isRunning) onClose();
  };

  const goResolveMissingItemNumbers = () => {
    onClose();
    router.push(MISSING_ITEM_NUMBER_HREF);
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
        <header className="flex shrink-0 items-center gap-2 border-b border-border-soft inset-field py-2">
          <div className="min-w-0 flex-1">
            <p className={`${microBadge} text-text-soft`}>Order Sync</p>
            <h2 className={`${sectionLabel} mt-0.5 text-text-default`}>
              {isRunning ? 'Importing latest orders' : 'Import complete'}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
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
                className="h-7 px-2.5 text-role-micro bg-red-50 text-red-700 ring-inset ring-red-200 hover:bg-red-100"
              >
                Cancel
              </Button>
            ) : null}
            <IconButton
              icon={<X className="h-3.5 w-3.5" />}
              size="sm"
              ariaLabel="Close"
              onClick={handleClose}
              disabled={isRunning}
              className={`hover:bg-surface-sunken ${FLUSH}`}
            />
          </div>
        </header>

        {/* Cybertruck stack: parent underline → child segment (Claim · TicketDisplayHost). */}
        <div className="flex shrink-0 flex-col gap-0">
          <TabDisplay
            tabs={parentTabs}
            activeTab={bodyTab}
            onTabChange={(id) => setBodyTab(id as SyncBodyTab)}
            appearance="underline"
            density="nested"
            fit="fill"
            aria-label="Order sync sections"
          />
          {bodyTab === 'orders' ? (
            <div className="flex shrink-0 flex-col gap-0 border-b border-border-hairline">
              <TabDisplay
                tabs={ordersChildTabs}
                activeTab={ordersSource}
                onTabChange={(id) => setOrdersSource(id as OrdersSourceTab)}
                appearance="segment"
                density="nested"
                fit="fill"
                aria-label="Order import source"
                className="rounded-none border-x-0 border-t-0"
              />
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {bodyTab === 'orders' ? (
            ordersSource === 'sheets' ? (
              <TransferSection
                tab={sheets}
                label="Google Sheets"
                onResolveMissingItemNumbers={goResolveMissingItemNumbers}
              />
            ) : (
              <TransferSection
                tab={ecwid}
                label="Ecwid Direct"
                fromSheet={ecwidRowsFromSheet}
              />
            )
          ) : (
            <ExceptionsSection tab={exceptions} />
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border-soft bg-surface-canvas inset-field py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-role-micro text-text-muted">
            <span className="inline-flex items-center gap-1">
              {statusDot(sheets.status)} <span>{statusLabel(sheets.status, sheets.summary)}</span>
            </span>
            <span className="text-text-faint">·</span>
            <span className="inline-flex items-center gap-1">
              {statusDot(ecwid.status)} <span>{statusLabel(ecwid.status, ecwid.summary)}</span>
            </span>
            <span className="text-text-faint">·</span>
            <span className="inline-flex items-center gap-1">
              {statusDot(exceptions.status)}{' '}
              <span>{statusLabel(exceptions.status, exceptions.summary)}</span>
            </span>
          </div>
          <Button
            variant="brand"
            size="sm"
            onClick={handleClose}
            disabled={isRunning}
            className="h-7 px-2.5 text-role-micro"
          >
            {isRunning ? 'Running…' : 'Close'}
          </Button>
        </footer>
      </div>
    </DetailStackRailRegistrar>
  );
}
