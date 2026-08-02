'use client';

import Link from 'next/link';
import { Fragment, memo, type ReactNode } from 'react';
import { GridCellDash, GridDateTimeCellValue } from '@/components/ui/grid-cells';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  ALLOCATION_REASON_LABELS,
  CHANNEL_DISPOSITION_LABELS,
  type AllocationHit,
  type ChannelDisposition,
  type ReadyAllocationState,
} from '@/lib/channel-allocation';
import { conditionLabel } from '@/lib/conditions';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { fbaOutboundHref } from '@/lib/fba/fba-modes';
import { serialStatusDot, serialStatusLabel } from '@/lib/inventory/serial-status-display';
import { velocityTierMeta } from '@/lib/velocity-tier-tone';
import { cn } from '@/utils/_cn';
import { READY_GRID_CAPABILITIES } from './ready-grid-descriptor';
import {
  READY_GRID_COLUMNS,
  READY_GRID_FROZEN_CELL,
  readyGridCell,
  readyGridFrozenLeft,
  readyGridRowShellClass,
  readyGridTemplate,
  type ReadyGridColumn,
} from './ready-grid-layout';

const dataCell = (col: ReadyGridColumn, rule = true) =>
  cn(readyGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

const CHIP =
  'min-w-0 truncate rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset';

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

export function readyVerdictLabel(verdict: string | null): string {
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

/** The unit a hit is about — title, else SKU, else the bare entity id. */
export function readyHitTitle(hit: AllocationHit): string {
  return hit.title || hit.sku || `Unit #${hit.entityId}`;
}

/** Identifier trail under the title (SKU · serial · FNSKU · ASIN). */
function readyHitMeta(hit: AllocationHit): string {
  return (
    [hit.sku, hit.serialNumber, hit.fnsku, hit.asin].filter(Boolean).join(' · ') ||
    `id ${hit.entityId}`
  );
}

/** Destination label when a hit has no channel-allocation disposition. */
export function readyFallbackStateLabel(hit: AllocationHit): string {
  return hit.allocationState === 'NOT_READY'
    ? serialStatusLabel(hit.unitStatus)
    : ALLOCATION_STATE_LABEL[hit.allocationState];
}

/**
 * One recently-tested hit — CSS-grid columns matching {@link READY_GRID_COLUMNS}.
 *
 * Deliberately NOT interactive as a row: these are append-only history records
 * with no detail plane to open, so the row carries no `role="button"` and no
 * pointer cursor. The only affordance is the action cell's Stage-FBA link.
 */
export const ReadyGridRow = memo(function ReadyGridRow({
  hit,
  columns = READY_GRID_COLUMNS,
}: {
  hit: AllocationHit;
  columns?: readonly ReadyGridColumn[];
}) {
  const tierMeta = hit.velocityTier ? velocityTierMeta(hit.velocityTier) : null;
  const condGrade = (hit.conditionGrade || '').toUpperCase();

  const renderCell = (col: ReadyGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              readyGridCell({ inset: 'none', rule: true }),
              READY_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: readyGridFrozenLeft('select') }}
          >
            <span className="h-4 w-4 shrink-0" aria-hidden />
          </div>
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(col, rule), READY_GRID_FROZEN_CELL, 'gap-1.5')}
            style={{ left: readyGridFrozenLeft('title') }}
            data-frozen-edge
          >
            <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
              {readyHitTitle(hit)}
            </span>
            <span className="min-w-0 shrink truncate text-role-eyebrow uppercase tracking-widest text-text-faint">
              {readyHitMeta(hit)}
            </span>
          </div>
        );
      case 'verdict':
        return (
          <div data-col="verdict" className={dataCell(col, rule)}>
            <span className={cn(CHIP, verdictClass(hit.verdict))}>
              {readyVerdictLabel(hit.verdict)}
            </span>
          </div>
        );
      case 'destination':
        return (
          <div data-col="destination" className={dataCell(col, rule)}>
            {hit.disposition ? (
              <span className={cn(CHIP, DISPOSITION_CLASS[hit.disposition])}>
                {CHANNEL_DISPOSITION_LABELS[hit.disposition]}
              </span>
            ) : (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-role-caption text-text-muted">
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', serialStatusDot(hit.unitStatus))}
                  aria-hidden
                />
                <span className="min-w-0 truncate">{readyFallbackStateLabel(hit)}</span>
              </span>
            )}
          </div>
        );
      case 'reasons':
        return (
          <div data-col="reasons" className={cn(dataCell(col, rule), 'gap-1')}>
            {hit.reasons.length > 0 ? (
              hit.reasons.map((reason) => (
                <span
                  key={reason}
                  className={cn(CHIP, 'bg-surface-sunken text-text-muted ring-border-soft')}
                >
                  {ALLOCATION_REASON_LABELS[reason]}
                </span>
              ))
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'velocity':
        return (
          <div data-col="velocity" className={dataCell(col, rule)}>
            {tierMeta ? (
              <span className={cn(CHIP, 'ring-border-soft', tierMeta.ring)}>{tierMeta.label}</span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'condition':
        return (
          <div data-col="condition" className={dataCell(col, rule)}>
            {hit.conditionGrade ? (
              <span
                className={cn(
                  'min-w-0 truncate text-role-eyebrow uppercase',
                  conditionGradeTextClass(condGrade),
                )}
              >
                {conditionLabel(hit.conditionGrade, 'compact')}
              </span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'tested':
        return (
          <div data-col="tested" className={cn(dataCell(col, rule), 'flex-col items-end gap-0')}>
            {hit.testedAt ? (
              <GridDateTimeCellValue raw={hit.testedAt} className="text-role-caption text-text-soft" />
            ) : (
              <GridCellDash />
            )}
            {hit.testedByName ? (
              <span className="min-w-0 truncate text-role-eyebrow uppercase tracking-widest text-text-faint">
                {hit.testedByName}
              </span>
            ) : null}
          </div>
        );
      case 'action':
        return (
          <div data-col="action" className={dataCell(col, rule)}>
            {hit.allocationState === 'READY' && hit.disposition === 'FBA' ? (
              <Link
                href={fbaOutboundHref()}
                className={cn(
                  'inline-flex h-7 items-center rounded-lg px-2 text-role-caption font-semibold text-text-fulfillment hover:bg-surface-hover',
                  focusRing('control', 'accent'),
                )}
              >
                Stage FBA
              </Link>
            ) : hit.allocationState === 'READY' && hit.disposition === 'PREBOX_STOCK' ? (
              <span className="min-w-0 truncate text-role-eyebrow uppercase tracking-widest text-text-success">
                Pre-box
              </span>
            ) : (
              <span className="min-w-0 truncate text-role-eyebrow uppercase tracking-widest text-text-faint">
                History
              </span>
            )}
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      data-ready-row-id={hit.testingResultId}
      className={cn(
        readyGridRowShellClass(false, { scrollMinContent: true }),
        ledgerRowFillClass({ selected: false, capabilities: READY_GRID_CAPABILITIES }),
        // The shared fill helper assumes a pickable row and bakes in
        // `cursor-pointer`. This row opens nothing, so the pointer would promise
        // an interaction that does not exist — override it (twMerge keeps the
        // later cursor).
        'cursor-default',
      )}
      style={{ gridTemplateColumns: readyGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
