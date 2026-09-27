'use client';

/** Ready LedgerGrid cell registry — one switch, edit the matching case. */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { GridCellDash, GridDateTimeCellValue, GridStatusCellValue } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import {
  ALLOCATION_REASON_LABELS,
  CHANNEL_DISPOSITION_LABELS,
  type AllocationHit,
  type ChannelDisposition,
} from '@/lib/channel-allocation';
import { conditionLabel } from '@/lib/conditions';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { fbaOutboundHref } from '@/lib/fba/fba-modes';
import { serialStatusDot } from '@/lib/inventory/serial-status-display';
import {
  readyFallbackStateLabel,
  readyHitTitle,
  readyVerdictLabel,
  resolveReadySlotValue,
} from '@/lib/tables/field-catalog/ready-resolve';
import { isSlotTrackKey } from '@/lib/tables/materialize-tracks';
import type { VelocityTierMeta } from '@/lib/velocity-tier-tone';
import { cn } from '@/utils/_cn';
import {
  READY_GRID_FROZEN_CELL,
  readyGridCell,
  readyGridFrozenLeft,
  type ReadyGridColumn,
} from '../ready-grid-layout';

/** Secondary categorical chips (reasons / velocity) — not lifecycle status. */
const CHIP = cn(
  'min-w-0 truncate px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset',
  cornerClass('chip'),
);

/** Tone maps for house {@link GridStatusCellValue} — bg + text only; ring from the cell. */
const DISPOSITION_CLASS: Record<ChannelDisposition, string> = {
  FBA: 'bg-surface-accent text-text-accent',
  PREBOX_STOCK: 'bg-surface-success text-text-success',
  HOLD: 'bg-surface-warning text-text-warning',
};

function verdictClass(verdict: string | null): string {
  if (verdict === 'PASS') return 'bg-surface-success text-text-success';
  if (verdict === 'TESTING_FAILED') return 'bg-surface-danger text-text-danger';
  return 'bg-surface-warning text-text-warning';
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
    <span className="inline-flex min-w-0 max-w-full shrink items-center gap-1 overflow-hidden text-role-eyebrow text-text-faint industrial:uppercase industrial:tracking-widest">
      {tokens.map((token, i) => (
        <span key={`${token.kind}:${token.value}`} className="inline-flex min-w-0 items-center gap-1">
          {i > 0 ? <span className="shrink-0" aria-hidden>·</span> : null}
          <CopyableCellValue
            value={token.value}
            historyKind={token.kind}
            className="min-w-0 truncate font-sans text-role-eyebrow text-text-faint industrial:font-mono industrial:uppercase industrial:tracking-widest"
            dense
          />
        </span>
      ))}
    </span>
  );
}

export interface ReadyGridCellCtx {
  hit: AllocationHit;
  tierMeta: VelocityTierMeta | null;
  condGrade: string;
  /** The MOUNTED model — frozen offsets derive from it, never a static list. */
  columns: readonly ReadyGridColumn[];
}

function dataCell(col: ReadyGridColumn, rule = true) {
  return cn(readyGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));
}

/** The body of one materialized slot track, chosen by the BOUND FIELD. */
function renderReadySlotBody(fieldId: string | undefined, ctx: ReadyGridCellCtx): ReactNode {
  const { hit, tierMeta, condGrade } = ctx;
  switch (fieldId) {
    case 'ready.verdict':
      return (
        <GridStatusCellValue
          label={readyVerdictLabel(hit.verdict)}
          toneClass={verdictClass(hit.verdict)}
        />
      );
    case 'ready.destination':
      return hit.disposition ? (
        <GridStatusCellValue
          label={CHANNEL_DISPOSITION_LABELS[hit.disposition]}
          toneClass={DISPOSITION_CLASS[hit.disposition]}
        />
      ) : (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-role-caption text-text-muted">
          <span
            className={cn('h-2 w-2 shrink-0', cornerClass('pill'), serialStatusDot(hit.unitStatus))}
            aria-hidden
          />
          <span className="min-w-0 truncate">{readyFallbackStateLabel(hit)}</span>
        </span>
      );
    case 'ready.reasons':
      return hit.reasons.length > 0 ? (
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
      );
    case 'ready.velocity':
      return tierMeta ? (
        <span className={cn(CHIP, 'ring-border-soft', tierMeta.ring)}>{tierMeta.label}</span>
      ) : (
        <GridCellDash />
      );
    case 'ready.condition':
      return hit.conditionGrade ? (
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
      );
    case 'ready.tested':
      // Two lines, one fact: WHEN the test landed and WHO ran it. The tester is
      // the stamp's second half, not a separate bindable column.
      return (
        <span className="flex min-w-0 flex-col items-end gap-0">
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
        </span>
      );
    default: {
      // A catalog field with no bespoke face paints its resolved text — a new
      // bindable fact needs a resolver case, never a new column file.
      const value = fieldId ? resolveReadySlotValue(hit, fieldId) : null;
      const text = value?.kind === 'value' ? value.text : null;
      return text ? (
        <span className="min-w-0 truncate text-role-caption text-text-soft">{text}</span>
      ) : (
        <GridCellDash />
      );
    }
  }
}

export function renderReadyGridCell(
  col: ReadyGridColumn,
  rule: boolean,
  ctx: ReadyGridCellCtx,
): ReactNode {
  const { hit, columns } = ctx;
  if (isSlotTrackKey(col.key)) {
    return (
      <div data-col={col.key} className={dataCell(col, rule)}>
        {renderReadySlotBody(col.fieldId, ctx)}
      </div>
    );
  }
  switch (col.key) {
    case 'select':
      return (
        <div
          className={cn(
            readyGridCell({ inset: 'none', rule: true }),
            READY_GRID_FROZEN_CELL,
            'justify-center',
          )}
          // Offsets from the MOUNTED model, never a static list.
          style={{ left: readyGridFrozenLeft(columns, 'select') }}
        >
          <span className="h-4 w-4 shrink-0" aria-hidden />
        </div>
      );
    case 'title':
      return (
        <div
          data-col="title"
          className={cn(dataCell(col, rule), READY_GRID_FROZEN_CELL, 'gap-1.5')}
          style={{ left: readyGridFrozenLeft(columns, 'title') }}
          data-frozen-edge
        >
          <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
            {readyHitTitle(hit)}
          </span>
          <ReadyHitMetaTrail hit={hit} />
        </div>
      );
    case 'action':
      return (
        <div data-col="action" className={dataCell(col, rule)}>
          {hit.allocationState === 'READY' && hit.disposition === 'FBA' ? (
            <Link
              href={fbaOutboundHref()}
              className={cn(
                'inline-flex h-7 items-center px-2 text-role-caption font-semibold text-text-fulfillment hover:bg-surface-hover',
                cornerClass('control'),
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
