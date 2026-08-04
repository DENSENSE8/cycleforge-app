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
  receivingGridCell,
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
  platformMeta: SourcePlatformMeta;
  markLabel: string;
  poValue: string;
  isPickup: boolean;
  pickupLabel: string | null;
  trackingValue: string;
  serialsCsv: string;
  statusDot: string;
  /** Per-hideKey display prefs from staff column-display panel. */
  columnDisplay?: Readonly<Record<string, GridColumnDisplayPref>>;
  /** Select-gutter face visibility. Defaults to `'always'` at call sites. */
  selectGutterChrome?: GridSelectGutterChrome;
  /**
   * Unbox History click-select: body click toggles bulk; gutter is an empty
   * spacer (select-all lives in the header only).
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
  );
}

/** Staff column-display highlight wash — inline style, not a Tailwind class. */
export function receivingDataCellHighlightStyle(
  col: ReceivingGridColumn,
  ctx?: ReceivingGridCellCtx,
): CSSProperties | undefined {
  const pref = col.hideKey && ctx?.columnDisplay ? ctx.columnDisplay[col.hideKey] : undefined;
  return gridColumnHighlightStyle(pref?.highlight);
}

/** True when this column should wrap its primary value in chip chrome. */
export function receivingCellWantsChip(col: ReceivingGridColumn, ctx: ReceivingGridCellCtx): boolean {
  if (!col.hideKey || col.frozen) return false;
  return ctx.columnDisplay?.[col.hideKey]?.cell === 'chip';
}
