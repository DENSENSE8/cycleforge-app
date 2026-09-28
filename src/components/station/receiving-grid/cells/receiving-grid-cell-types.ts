/**
 * Shared context for Unbox / History / Testing LedgerGrid cells.
 * Row shell builds this once; cells stay column-scoped.
 */

import { gridDataCellClass } from '@/design-system/components/grid';
import type { CSSProperties } from 'react';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ReceivingActivityAxis } from '@/lib/receiving/receiving-stage-stamp';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import { gridFrozenLeft } from '@/design-system/components/grid/grid-column-geometry';
import {
  RECEIVING_GRID_FROZEN_CELL,
  type ReceivingGridColumn,
} from '@/lib/receiving/receiving-grid-layout';
import type { SourcePlatformMeta } from '@/lib/source-platform';
import type { CustomFieldDef } from '@/lib/custom-fields/types';

export type ReceivingActivityDateCell = {
  label: string;
  tooltip: string;
} | null;

export type ReceivingGridCellCtx = {
  row: ReceivingLineRow;
  /** The column model actually MOUNTED on this row. */
  columns: readonly ReceivingGridCellColumn[];
  selectMode: boolean;
  /** Either plane is live on this row — used for the row fill only. */
  isSelected: boolean;
  /** Bulk membership (the gutter plane). Drives the checkbox alone. */
  isChecked: boolean;
  /**
   * Toggle bulk membership. Present only on surfaces that split the two planes
   * (History); absent on the legacy single-gesture rows, where the
   * gutter stays a painted span and the ROW click does the ticking.
   */
  onToggle?: () => void;
  activityAxis: ReceivingActivityAxis;
  isHistory: boolean;
  /**
   * Unbox / Receiving History → `'coarse'` (Scanned / Unboxed / Received).
   * Testing History stays `'fine'` so FAILED / PASSED remain visible.
   */
  statusVocabulary: 'fine' | 'coarse';
  /** Chip wash+ink for the status cell — fine workflow or coarse lifecycle. */
  statusBadgeClass: string;
  productTitle: string;
  conditionLabel: string;
  condGrade: string;
  stageDisplay: string | null;
  /** Human stage name from the workflow-stage registry — never a local map. */
  stageLabel: string;
  stageTip: string;
  dateCell: ReceivingActivityDateCell;
  poValue: string;
  /** Fold parent already spoke the PO — dash it on this leaf. */
  quietIdentity?: boolean;
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
  /** Open this row's record plane (the compound layout's chevron). */
  onOpenRecord?: () => void;
  serialsCsv: string;
  statusDot: string;
  /**
   * Connected inventory provider display name (e.g. "Zoho Inventory"), or the
   * generic capability title. Used for History UNBOXED sync tooltips.
   */
  inventoryProviderLabel: string;
  /** Select-gutter face visibility. Defaults to `'always'` at call sites. */
  selectGutterChrome?: GridSelectGutterChrome;
  /**
   * Unbox History click-select: body click toggles bulk; gutter paints
   * decorative GridClickSelectFace when selected (select-all in header).
   */
  clickSelect?: boolean;
  /** Live defs for `custom:*` columns — type lookup for {@link CustomFieldCell}. */
  customFieldDefs?: readonly CustomFieldDef[];
};

/** Column model a cell may receive. */
export type ReceivingGridCellColumn = ReceivingGridColumn;

export type ReceivingGridCellProps = {
  col: ReceivingGridCellColumn;
  /** When false, omit the trailing column rule (last visible column). */
  rule: boolean;
  ctx: ReceivingGridCellCtx;
};

export function receivingDataCellClass(col: ReceivingGridCellColumn, rule = true, _ctx?: ReceivingGridCellCtx): string {
  // Delegates to the shared composition — this file assembled the concerns by
  // hand and Orders assembled a different subset, which is how the two families
  // drifted apart.
  return gridDataCellClass(col, {
    rule,
    inset: 'grid',
    frozenClass: RECEIVING_GRID_FROZEN_CELL,
  });
}

/**
 * Inline cell style — sticky-left for frozen identity tracks. One helper so
 * leaf cells never hand-roll `left` past the SoT offset.
 */
export function receivingDataCellStyle(
  col: ReceivingGridCellColumn,
  ctx: ReceivingGridCellCtx,
): CSSProperties | undefined {
  if (!col.frozen) return undefined;
  return { left: gridFrozenLeft(ctx.columns, col.key) };
}

/**
 * `data-frozen-edge` on the TRAILING frozen cell of the mounted model — the
 * same rule `CompoundGridCell` applies. A family constant named a key one of
 * the two models does not carry, so the shadow hung on nothing.
 */
export function receivingFrozenEdgeProps(
  col: ReceivingGridCellColumn,
  columns: readonly ReceivingGridCellColumn[],
): { 'data-frozen-edge'?: true } {
  const trailingFrozen = [...columns].reverse().find((c) => c.frozen)?.key;
  return col.frozen && col.key === trailingFrozen ? { 'data-frozen-edge': true } : {};
}
