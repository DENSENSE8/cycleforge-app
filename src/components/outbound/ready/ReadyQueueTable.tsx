'use client';

import Link from 'next/link';
import { Loader2, Package, RefreshCw } from '@/components/Icons';
import { Button, EmptyState } from '@/design-system/primitives';
import {
  ALLOCATION_REASON_LABELS,
  CHANNEL_DISPOSITION_LABELS,
  type AllocationHit,
  type ChannelDisposition,
  type ReadyAllocationState,
} from '@/lib/channel-allocation';
import { conditionLabel } from '@/lib/conditions';
import { serialStatusDot, serialStatusLabel } from '@/lib/inventory/serial-status-display';
import { velocityTierMeta } from '@/lib/velocity-tier-tone';
import { formatDateTimePST } from '@/utils/date';
import { fbaOutboundHref } from '@/lib/fba/fba-modes';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const DISPOSITION_CLASS: Record<ChannelDisposition, string> = {
  FBA: 'bg-violet-50 text-violet-700 ring-violet-200',
  PREBOX_STOCK: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  HOLD: 'bg-amber-50 text-amber-800 ring-amber-200',
};

const ALLOCATION_STATE_LABEL: Record<ReadyAllocationState, string> = {
  READY: 'Ready',
  FBA_STAGED: 'In FBA',
  ORDER_ALLOCATED: 'Order allocated',
  NOT_READY: 'Not ready',
};

interface ReadyQueueTableProps {
  hits: AllocationHit[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
}

export function ReadyQueueTable({
  hits,
  isLoading,
  isError,
  isFetching,
  onRetry,
}: ReadyQueueTableProps) {
  if (isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-text-faint" />
        <span className="ml-2 text-role-caption font-semibold text-text-soft">
          Loading tested history…
        </span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <div className="inset-empty rounded-xl border border-dashed border-border-danger bg-surface-danger text-center">
          <p className="text-role-caption font-semibold text-text-danger">
            Could not load recently-tested history
          </p>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw />}
            onClick={onRetry}
            className="mt-3"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (hits.length === 0) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <EmptyState
          icon={<Package className="h-6 w-6 text-text-faint" />}
          title="No tested units in this view"
          description="Completed testing verdicts appear here newest first. Clear the search or choose All tested."
        />
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto" aria-busy={isFetching}>
      <table className="min-w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-surface-card">
          <tr className="border-b border-border-soft text-left text-role-micro uppercase tracking-widest text-text-soft">
            <th className="px-3 py-3">Product</th>
            <th className="px-3 py-3">Verdict</th>
            <th className="px-3 py-3">Destination</th>
            <th className="px-3 py-3">Reasons</th>
            <th className="px-3 py-3">Velocity</th>
            <th className="px-3 py-3">Condition</th>
            <th className="px-3 py-3">Tested</th>
            <th className="px-3 py-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-hairline bg-surface-card">
          {hits.map((hit) => (
            <ReadyRow key={hit.testingResultId} hit={hit} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function verdictLabel(verdict: string | null): string {
  if (verdict === 'PASS') return 'Passed';
  if (verdict === 'TEST_AGAIN') return 'Retest';
  if (verdict === 'TESTING_FAILED') return 'Failed';
  return 'Recorded';
}

function verdictClass(verdict: string | null): string {
  if (verdict === 'PASS') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (verdict === 'TESTING_FAILED') return 'bg-rose-50 text-rose-700 ring-rose-200';
  return 'bg-amber-50 text-amber-800 ring-amber-200';
}

function ReadyRow({ hit }: { hit: AllocationHit }) {
  const tierMeta = hit.velocityTier ? velocityTierMeta(hit.velocityTier) : null;
  const testedLabel = hit.testedAt ? formatDateTimePST(hit.testedAt) : '—';
  const cond = hit.conditionGrade ? conditionLabel(hit.conditionGrade, 'table') : '—';

  return (
    <tr className="hover:bg-surface-hover">
      <td className="max-w-[280px] px-3 py-3">
        <p className="truncate text-role-caption font-semibold text-text-default">
          {hit.title || hit.sku || `Unit #${hit.entityId}`}
        </p>
        <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
          {[hit.sku, hit.serialNumber, hit.fnsku, hit.asin].filter(Boolean).join(' · ') ||
            `id ${hit.entityId}`}
        </p>
      </td>
      <td className="px-3 py-3">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset',
            verdictClass(hit.verdict),
          )}
        >
          {verdictLabel(hit.verdict)}
        </span>
      </td>
      <td className="px-3 py-3">
        {hit.disposition ? (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset',
              DISPOSITION_CLASS[hit.disposition],
            )}
          >
            {CHANNEL_DISPOSITION_LABELS[hit.disposition]}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-role-caption font-semibold text-text-muted">
            <span
              className={cn('h-2 w-2 rounded-full', serialStatusDot(hit.unitStatus))}
              aria-hidden
            />
            {ALLOCATION_STATE_LABEL[hit.allocationState] === 'Not ready'
              ? serialStatusLabel(hit.unitStatus)
              : ALLOCATION_STATE_LABEL[hit.allocationState]}
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {hit.reasons.length > 0 ? (
            hit.reasons.map((reason) => (
              <span
                key={reason}
                className="rounded bg-surface-sunken px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft"
              >
                {ALLOCATION_REASON_LABELS[reason]}
              </span>
            ))
          ) : (
            <span className="text-role-caption text-text-faint">—</span>
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        {tierMeta ? (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset ring-border-soft',
              tierMeta.ring,
            )}
          >
            {tierMeta.label}
          </span>
        ) : (
          <span className="text-role-caption text-text-faint">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-role-caption font-semibold text-text-soft">{cond}</td>
      <td className="px-3 py-3">
        <p className="text-role-caption text-text-soft tabular-nums">{testedLabel}</p>
        {hit.testedByName ? (
          <p className="text-role-eyebrow text-text-faint">{hit.testedByName}</p>
        ) : null}
      </td>
      <td className="px-3 py-3">
        {hit.allocationState === 'READY' && hit.disposition === 'FBA' ? (
          <Link
            href={fbaOutboundHref()}
            className={cn(
              'inline-flex h-8 items-center rounded-lg px-3 text-role-caption font-semibold text-text-fulfillment hover:bg-surface-hover',
              focusRing('control', 'accent'),
            )}
          >
            Stage FBA
          </Link>
        ) : hit.allocationState === 'READY' && hit.disposition === 'PREBOX_STOCK' ? (
          <span className="text-role-caption font-semibold uppercase tracking-widest text-text-success">
            Pre-box & stock
          </span>
        ) : (
          <span className="text-role-caption text-text-faint">History</span>
        )}
      </td>
    </tr>
  );
}
