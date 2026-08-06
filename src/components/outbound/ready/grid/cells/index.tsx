'use client';

/**
 * Ready LedgerGrid cell registry — one switch, edit the matching case.
 * Row shell builds {@link ReadyGridCellCtx}; domain values stay here.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { GridCellDash, GridDateTimeCellValue, GridStatusCellValue } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
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
import type { VelocityTierMeta } from '@/lib/velocity-tier-tone';
import { cn } from '@/utils/_cn';
import {
  READY_GRID_FROZEN_CELL,
  readyGridCell,
  readyGridFrozenLeft,
  type ReadyGridColumn,
} from '../ready-grid-layout';

/** Secondary categorical chips (reasons / velocity) — not lifecycle status. */
const CHIP =
  'min-w-0 truncate rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset';

/** Tone maps for house {@link GridStatusCellValue} — bg + text only; ring from the cell. */
const DISPOSITION_CLASS: Record<ChannelDisposition, string> = {
  FBA: 'bg-violet-50 text-violet-700',
  PREBOX_STOCK: 'bg-emerald-50 text-emerald-700',
  HOLD: 'bg-amber-50 text-amber-800',
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
  if (verdict === 'PASS') return 'bg-emerald-50 text-emerald-700';
  if (verdict === 'TESTING_FAILED') return 'bg-rose-50 text-rose-700';
  return 'bg-amber-50 text-amber-800';
}

/** The unit a hit is about — title, else SKU, else the bare entity id. */
export function readyHitTitle(hit: AllocationHit): string {
  return hit.title || hit.sku || `Unit #${hit.entityId}`;
}

/** Identifier trail tokens under the title (SKU · serial · FNSKU · ASIN). */
function readyHitMetaTokens(hit: AllocationHit): { value: string; kind: string }[] {
  const tokens: { value: string; kind: string }[] = [];
  if (hit.sku) tokens.push({ value: hit.sku, kind: 'sku' });
  if (hit.serialNumber) tokens.push({ value: hit.serialNumber, kind: 'serial' });
  if (hit.fnsku) tokens.push({ value: hit.fnsku, kind: 'fnsku' });
  if (hit.asin) tokens.push({ value: hit.asin, kind: 'id' });
  if (tokens.length === 0) tokens.push({ value: `id ${hit.entityId}`, kind: 'id' });
  return tokens;
}

function ReadyHitMetaTrail({ hit }: { hit: AllocationHit }) {
  const tokens = readyHitMetaTokens(hit);
  return (
    <span className="inline-flex min-w-0 max-w-full shrink items-center gap-1 overflow-hidden text-role-eyebrow uppercase tracking-widest text-text-faint">
      {tokens.map((token, i) => (
        <span key={`${token.kind}:${token.value}`} className="inline-flex min-w-0 items-center gap-1">
          {i > 0 ? <span className="shrink-0" aria-hidden>·</span> : null}
          <CopyableCellValue
            value={token.value}
            historyKind={token.kind}
            className="min-w-0 truncate font-mono text-role-eyebrow uppercase tracking-widest text-text-faint"
            dense
          />
        </span>
      ))}
    </span>
  );
}

/** Destination label when a hit has no channel-allocation disposition. */
export function readyFallbackStateLabel(hit: AllocationHit): string {
  return hit.allocationState === 'NOT_READY'
    ? serialStatusLabel(hit.unitStatus)
    : ALLOCATION_STATE_LABEL[hit.allocationState];
}

export interface ReadyGridCellCtx {
  hit: AllocationHit;
  tierMeta: VelocityTierMeta | null;
  condGrade: string;
}

function dataCell(col: ReadyGridColumn, rule = true) {
  return cn(readyGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));
}

export function renderReadyGridCell(
  col: ReadyGridColumn,
  rule: boolean,
  ctx: ReadyGridCellCtx,
): ReactNode {
  const { hit, tierMeta, condGrade } = ctx;
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
          <ReadyHitMetaTrail hit={hit} />
        </div>
      );
    case 'verdict':
      return (
        <div data-col="verdict" className={dataCell(col, rule)}>
          <GridStatusCellValue
            label={readyVerdictLabel(hit.verdict)}
            toneClass={verdictClass(hit.verdict)}
          />
        </div>
      );
    case 'destination':
      return (
        <div data-col="destination" className={dataCell(col, rule)}>
          {hit.disposition ? (
            <GridStatusCellValue
              label={CHANNEL_DISPOSITION_LABELS[hit.disposition]}
              toneClass={DISPOSITION_CLASS[hit.disposition]}
            />
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
        <div data-col="reasons" className={cn(dataCell(col, rule), 'min-w-0 gap-1')}>
          {hit.reasons.length > 0 ? (
            <span className="inline-flex min-w-0 max-w-full flex-nowrap items-center gap-1 overflow-hidden">
              {hit.reasons.slice(0, 2).map((reason) => (
                <span
                  key={reason}
                  className={cn(CHIP, 'bg-surface-sunken text-text-muted ring-border-soft')}
                >
                  {ALLOCATION_REASON_LABELS[reason]}
                </span>
              ))}
              {hit.reasons.length > 2 ? (
                <HoverTooltip
                  label={hit.reasons.map((r) => ALLOCATION_REASON_LABELS[r]).join(' · ')}
                  focusable={false}
                >
                  <span className="shrink-0 text-role-micro text-text-soft">
                    +{hit.reasons.length - 2}
                  </span>
                </HoverTooltip>
              ) : null}
            </span>
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
}
