'use client';

/**
 * Receiving's compound cells — thin wrappers, not an implementation.
 *
 * Each supplies the family's grid-cell chrome (the `receivingDataCellClass`
 * wrapper, `data-col`, highlight style) around a SHARED body from
 * `components/tables/compound`. Nothing about the two-row layout lives here;
 * this file only adapts the row and places the body.
 */

import {
  CompoundFulfillment,
  CompoundItem,
  CompoundOpen,
  CompoundState,
  CompoundThumb,
} from '@/components/tables/compound/CompoundCells';
import { receivingCompoundView } from '@/lib/receiving/receiving-compound-view';
import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import { cn } from '@/utils/_cn';
import {
  receivingDataCellClass,
  receivingDataCellHighlightStyle,
  type ReceivingGridCellCtx,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/** The ctx already carries every resolved display string — reuse, never re-derive. */
function viewFor(ctx: ReceivingGridCellCtx): CompoundRowView {
  return receivingCompoundView(ctx.row, {
    title: ctx.productTitle,
    stateLabel: ctx.stageLabel,
    // Receiving lines have no ship-by deadline, so there is no lateness to
    // report — `null` renders the on-time face rather than inventing a number.
    // When the receiving SLA lands, thread its days-late here and the column
    // starts working with no cell change.
    delayDays: null,
    delayTip: ctx.stageTip || undefined,
    tracking: (ctx.trackingValue || '').trim() || null,
    orderId: ctx.poValue || null,
  });
}

export function ReceivingCompoundThumbCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div
      data-col="thumb"
      className={cn(receivingDataCellClass(col, rule, ctx), 'items-center')}
      style={receivingDataCellHighlightStyle(col, ctx)}
    >
      <CompoundThumb view={viewFor(ctx)} />
    </div>
  );
}

export function ReceivingCompoundItemCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div
      data-col="item"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellHighlightStyle(col, ctx)}
    >
      <CompoundItem view={viewFor(ctx)} onCommitNote={ctx.onCommitNote} />
    </div>
  );
}

export function ReceivingCompoundFulfillmentCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div
      data-col="fulfillment"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellHighlightStyle(col, ctx)}
    >
      <CompoundFulfillment view={viewFor(ctx)} />
    </div>
  );
}

export function ReceivingCompoundStateCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div
      data-col="state"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellHighlightStyle(col, ctx)}
    >
      <CompoundState view={viewFor(ctx)} />
    </div>
  );
}

export function ReceivingCompoundOpenCell({ col, rule, ctx }: ReceivingGridCellProps) {
  return (
    <div
      data-col="open"
      className={cn(receivingDataCellClass(col, rule, ctx), 'justify-end')}
      style={receivingDataCellHighlightStyle(col, ctx)}
    >
      <CompoundOpen onOpen={ctx.onOpenRecord} />
    </div>
  );
}
