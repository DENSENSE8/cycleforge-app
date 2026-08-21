'use client';

/**
 * Receiving's compound track — an ADAPTER call, not a cell.
 *
 * This file used to export five wrapper components, one per compound column,
 * each hand-assembling the grid-cell class, `data-col` and the frozen offset.
 * That wrapper is now shared too ({@link renderCompoundGridCell}), because it
 * is where a cell's POSITION is decided and two families had already drifted
 * apart there while agreeing on the body. All that is left for a family is what
 * only it knows: how its row maps to a {@link CompoundRowView}.
 *
 * Serves Unbox / History / Testing AND Incoming — one dispatcher, because they
 * share a row type. The only thing the two split on is which lifecycle the
 * state pill reports, and that is a data question answered by the adapter.
 */

import type { ReactNode } from 'react';
import {
  isCompoundCellKey,
  renderCompoundGridCell,
} from '@/components/tables/compound/CompoundGridCell';
import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import { incomingStateFace } from '@/lib/receiving/incoming-compound-view';
import { receivingCompoundView } from '@/lib/receiving/receiving-compound-view';
import type {
  ReceivingGridCellColumn,
  ReceivingGridCellCtx,
} from './receiving-grid-cell-types';

export { isCompoundCellKey };

/**
 * Row → view. The ctx already carries every resolved display string, so this
 * never re-derives display logic that has a SoT elsewhere — it decides SHAPE.
 *
 * **`linePhase` picks the state vocabulary.** `'expected'` is Incoming: the box
 * is still with the carrier, so the pill reports `delivery_state` (or, on the
 * recently-removed lane, why the row left). Everything else is a landed line
 * and reports `workflow_status`. That is a genuine difference in what the row
 * MEANS, which is exactly the kind of difference the shared layout exists to
 * let through — as opposed to a difference in how it is drawn, which it does not.
 */
function viewFor(ctx: ReceivingGridCellCtx): CompoundRowView {
  const incoming = ctx.linePhase === 'expected';
  const state = incoming ? incomingStateFace(ctx.row) : null;

  return receivingCompoundView(ctx.row, {
    title: ctx.productTitle,
    stateLabel: state ? state.label : ctx.stageLabel,
    stateTone: state ? state.tone : undefined,
    stateTip: state ? state.tip : undefined,
    // Receiving lines have no ship-by deadline, so there is no lateness to
    // report — `null` renders the on-time face rather than inventing a number.
    // Incoming DOES have one (the expected-arrival date), and `ctx.daysLate` is
    // the same number the flat Age column shows, so the two layouts cannot
    // disagree about whether a box is overdue.
    delayDays: incoming ? (ctx.daysLate ?? null) : null,
    delayTip: (incoming ? ctx.ageTooltip : ctx.stageTip) || undefined,
    tracking: (ctx.trackingValue || '').trim() || null,
    orderId: ctx.poValue || null,
  });
}

/**
 * Paint one compound track for this family, or `null` if the key is not one.
 *
 * `ctx.columns` is the mounted model. It has a fallback at the call site rather
 * than here so a row shell that forgets to thread it fails visibly in one
 * place, not silently in five.
 */
export function renderReceivingCompoundCell(
  col: ReceivingGridCellColumn,
  rule: boolean,
  ctx: ReceivingGridCellCtx,
): ReactNode {
  return renderCompoundGridCell({
    col,
    columns: ctx.columns ?? [col],
    rule,
    view: viewFor(ctx),
    columnDisplay: ctx.columnDisplay,
    onCommitNote: ctx.onCommitNote,
    onOpen: ctx.onOpenRecord,
  });
}
