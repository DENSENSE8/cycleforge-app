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
import { isCompoundColumnModel } from '@/components/tables/compound/compound-columns';
import {
  isCompoundCellKey,
  renderCompoundGridCell,
} from '@/components/tables/compound/CompoundGridCell';
import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import { incomingStateFace } from '@/lib/receiving/incoming-compound-view';
import { receivingCompoundView } from '@/lib/receiving/receiving-compound-view';
import { incomingSlotValuesFor } from '@/lib/tables/field-catalog/incoming-resolve';
import { receivingSlotValuesFor } from '@/lib/tables/field-catalog/receiving-resolve';
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

  return {
    // Materialized slot tracks (wave 1.3) — one resolved value per BOUND slot,
    // keyed by track key. Empty on both product defaults, which is why the port
    // reproduces the row exactly; an org that binds Location gets a real column
    // with no change to this adapter.
    //
    // The resolver follows the same split as the state pill above: an Incoming
    // row answers the CARRIER's question and a landed row answers the
    // WAREHOUSE's, so `incoming.*` and `receiving.*` are two vocabularies over
    // one cell map. Routing by `linePhase` also means a binding from the other
    // family resolves to nothing rather than painting a lane-dependent lie.
    slots: incoming
      ? incomingSlotValuesFor(ctx.row, ctx.columns ?? [])
      : receivingSlotValuesFor(ctx.row, ctx.columns ?? []),
    ...receivingCompoundView(ctx.row, {
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
    }),
    quietIdentity: ctx.quietIdentity === true,
  };
}

/**
 * The row's SELECTION capability, in the family's own terms.
 *
 * Two planes, and the gutter serves whichever this surface split out:
 *
 * - **click-select** (Unbox History / Incoming Sheets): the ROW carries
 *   `role="checkbox"` and owns the toggle, so the gutter is DECORATIVE — no
 *   `onToggle`, no second control for a screen reader to disambiguate. It still
 *   paints the face, which is the whole point of the change: that column was
 *   blank at rest and read as dead space.
 * - **split planes** (row body opens the record, gutter ticks): a real
 *   checkbox, hit plane the full 48px cell.
 */
function selectFor(
  ctx: ReceivingGridCellCtx,
  detail?: {
    open: boolean;
    onToggle: () => void;
    label: string;
  },
) {
  return {
    checked: ctx.isChecked,
    onToggle: ctx.clickSelect ? undefined : ctx.onToggle,
    label: ctx.isChecked
      ? `Deselect receiving line ${ctx.row.id}`
      : `Select receiving line ${ctx.row.id} for bulk actions`,
    detail,
  };
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
  detail?: {
    open: boolean;
    onToggle: () => void;
    label: string;
  },
): ReactNode {
  const columns = ctx.columns ?? [col];
  const view = viewFor(ctx);
  return renderCompoundGridCell({
    col,
    columns,
    rule,
    view,
    onOpen: ctx.onOpenRecord,
    select: selectFor(ctx, detail ?? undefined),
  });
}

/** Row → view for the shell (detail band + disclosure). */
export function receivingCompoundRowView(ctx: ReceivingGridCellCtx): CompoundRowView {
  return viewFor(ctx);
}

/** Does this family's dispatcher own the key under the MOUNTED model? */
export function claimsCompoundCell(
  key: string,
  columns: readonly { key: string }[] | undefined,
): boolean {
  if (isCompoundCellKey(key)) return true;
  return key === 'select' && isCompoundColumnModel(columns ?? []);
}
