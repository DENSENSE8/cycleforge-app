/**
 * Shared context for Unbox / History / Testing LedgerGrid cell renderers.
 * Row shell builds this once; cells stay column-scoped.
 */

import type { CSSProperties } from 'react';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ReceivingActivityAxis } from '@/components/station/receiving-lines-table-helpers';
import {
  gridCellAlignClass,
  gridColumnHighlightStyle,
  gridColumnTextEmphasisClass,
  type GridColumnDisplayPref,
} from '@/design-system/components/grid';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import {
  RECEIVING_GRID_FROZEN_CELL,
  RECEIVING_GRID_FROZEN_EDGE_KEY,
  receivingGridCell,
  receivingGridFrozenLeft,
  type ReceivingGridColumn,
} from '@/lib/receiving/receiving-grid-layout';
import type { SourcePlatformMeta } from '@/lib/source-platform';
import { cn } from '@/utils/_cn';

export type ReceivingActivityDateCell = {
  label: string;
  tooltip: string;
} | null;

export type ReceivingGridCellCtx = {
  row: ReceivingLineRow;
  selectMode: boolean;
  /** Either plane is live on this row — used for the row fill only. */
  isSelected: boolean;
  /** Bulk membership (the gutter plane). Drives the checkbox alone. */
  isChecked: boolean;
  /**
   * Toggle bulk membership. Present only on surfaces that split the two planes
   * (Incoming / History); absent on the legacy single-gesture rows, where the
   * gutter stays a painted span and the ROW click does the ticking.
   */
  onToggle?: () => void;
  activityAxis: ReceivingActivityAxis;
  isHistory: boolean;
  productTitle: string;
  conditionLabel: string;
  condGrade: string;
  stageDisplay: string | null;
  /** Human stage name from the workflow-stage registry — never a local map. */
  stageLabel: string;
  stageTip: string;
  dateCell: ReceivingActivityDateCell;
  poValue: string;
  /** Catalog-resolved source-platform label for the order-id hover value. */
  platformLabel: string;
  /**
   * Catalog-resolved platform meta for dense Sheets brand-identity dots
   * (`platformMetaBrandDot`). Same resolve as {@link platformLabel}.
   */
  platformMeta: SourcePlatformMeta;
  isPickup: boolean;
  pickupLabel: string | null;
  trackingValue: string;
  /** Opens the receiving inspector for Edit on a filled tracking chip. */
  onEditTracking?: () => void;
  /** Opens the receiving inspector for Edit on a filled order / PO chip. */
  onEditOrder?: () => void;
  serialsCsv: string;
  statusDot: string;
  /**
   * Connected inventory provider display name (e.g. "Zoho Inventory"), or the
   * generic capability title. Used for History UNBOXED sync tooltips.
   */
  inventoryProviderLabel: string;
  /** Per-hideKey display prefs from staff column-display panel. */
  columnDisplay?: Readonly<Record<string, GridColumnDisplayPref>>;
  /** Select-gutter face visibility. Defaults to `'always'` at call sites. */
  selectGutterChrome?: GridSelectGutterChrome;
  /**
   * Unbox History click-select: body click toggles bulk; gutter paints
   * decorative GridClickSelectFace when selected (select-all in header).
   */
  clickSelect?: boolean;
};

export type ReceivingGridCellProps = {
  col: ReceivingGridColumn;
  /** When false, omit the trailing column rule (last visible column). */
  rule: boolean;
  ctx: ReceivingGridCellCtx;
};

export function receivingDataCellClass(col: ReceivingGridColumn, rule = true, ctx?: ReceivingGridCellCtx): string {
  const pref = col.hideKey && ctx?.columnDisplay ? ctx.columnDisplay[col.hideKey] : undefined;
  return cn(
    receivingGridCell({ rule, inset: 'grid' }),
    gridCellAlignClass(col),
    gridColumnTextEmphasisClass(pref?.text),
    col.frozen && RECEIVING_GRID_FROZEN_CELL,
  );
}

/**
 * Inline cell style — staff highlight wash + sticky-left for frozen identity
 * tracks. One helper so leaf cells never hand-roll `left` past the SoT offset.
 */
export function receivingDataCellStyle(
  col: ReceivingGridColumn,
  ctx?: ReceivingGridCellCtx,
): CSSProperties | undefined {
  const pref = col.hideKey && ctx?.columnDisplay ? ctx.columnDisplay[col.hideKey] : undefined;
  const highlight = gridColumnHighlightStyle(pref?.highlight);
  if (!col.frozen && !highlight) return undefined;
  return {
    ...highlight,
    ...(col.frozen ? { left: receivingGridFrozenLeft(col.key) } : null),
  };
}

/** @deprecated Prefer {@link receivingDataCellStyle} (folds frozen `left`). */
export function receivingDataCellHighlightStyle(
  col: ReceivingGridColumn,
  ctx?: ReceivingGridCellCtx,
): CSSProperties | undefined {
  return receivingDataCellStyle(col, ctx);
}

/** `data-frozen-edge` only on the trailing frozen identity cell. */
export function receivingFrozenEdgeProps(
  col: ReceivingGridColumn,
): { 'data-frozen-edge'?: true } {
  return col.key === RECEIVING_GRID_FROZEN_EDGE_KEY ? { 'data-frozen-edge': true } : {};
}

/** True when this column should wrap its primary value in chip chrome. */
export function receivingCellWantsChip(col: ReceivingGridColumn, ctx: ReceivingGridCellCtx): boolean {
  if (!col.hideKey || col.frozen) return false;
  return ctx.columnDisplay?.[col.hideKey]?.cell === 'chip';
}
