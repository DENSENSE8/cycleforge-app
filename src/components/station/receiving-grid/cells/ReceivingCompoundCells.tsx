'use client';

/** Receiving's compound track — an ADAPTER call, not a cell. */

import type { ReactNode } from 'react';
import { isCompoundColumnModel } from '@/components/tables/compound/compound-columns';
import {
  isCompoundCellKey,
  renderCompoundGridCell,
} from '@/components/tables/compound/CompoundGridCell';
import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import { receivingCompoundView } from '@/lib/receiving/receiving-compound-view';
import { receivingSlotValuesFor } from '@/lib/tables/field-catalog/receiving-resolve';
import type {
  ReceivingGridCellColumn,
  ReceivingGridCellCtx,
} from './receiving-grid-cell-types';

export { isCompoundCellKey };

/**
 * Row → view. The ctx already carries every resolved display string, so this
 * never re-derives display logic that has a SoT elsewhere — it decides SHAPE.
 */
function viewFor(ctx: ReceivingGridCellCtx): CompoundRowView {
  return {
    // Materialized slot tracks (wave 1.3) — one resolved value per BOUND slot, keyed by track key.
    slots: receivingSlotValuesFor(ctx.row, ctx.columns ?? []),
    ...receivingCompoundView(ctx.row, {
    title: ctx.productTitle,
    stateLabel: ctx.stageLabel,
    // Receiving lines have no ship-by deadline, so there is no lateness to
    // report — `null` renders the on-time face rather than inventing a number.
    delayDays: null,
    delayTip: ctx.stageTip || undefined,
    tracking: (ctx.trackingValue || '').trim() || null,
    orderId: ctx.poValue || null,
    }),
    quietIdentity: ctx.quietIdentity === true,
  };
}

/** The row's SELECTION capability, in the family's own terms. */
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

/** Paint one compound track for this family, or `null` if the key is not one. */
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
