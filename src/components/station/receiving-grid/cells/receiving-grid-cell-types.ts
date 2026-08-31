/**
 * Shared context for Unbox / History / Testing / Incoming LedgerGrid cells.
 * Row shell builds this once; cells stay column-scoped.
 */

import { gridDataCellClass } from '@/design-system/components/grid';
import type { CSSProperties, ReactNode } from 'react';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ReceivingActivityAxis } from '@/components/station/receiving-lines-table-helpers';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import { gridFrozenLeft } from '@/design-system/components/grid/grid-column-geometry';
import {
  RECEIVING_GRID_COLUMNS,
  RECEIVING_GRID_FROZEN_CELL,
  RECEIVING_GRID_FROZEN_EDGE_KEY,
  type IncomingGridColumn,
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
  /**
   * The column model actually MOUNTED on this row.
   *
   * Sticky-left offsets must derive from it, never from a family constant: a
   * surface that swaps between the flat and compound models freezes a different
   * prefix in each, and a key-only closure over one of them silently resolves
   * the wrong slot for the other (the compound `thumb` pinned on top of the
   * checkbox for exactly this reason).
   */
  columns?: readonly ReceivingGridCellColumn[];
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
  /**
   * Open this row's record plane (the compound layout's chevron). Distinct from
   * `onSelect`: selecting is "this is the row I mean", opening is "show me the
   * record" — the same split the row already makes between click and
   * double-click. Absent on surfaces with no record plane, which is exactly why
   * the chevron cell must render nothing rather than a dead control.
   */
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
  /**
   * Incoming POS is `'expected'` (delivery_state status, Age / Platform /
   * Removed / attach-tracking). History / Unbox / Testing omit or pass
   * `'landed'` so `status` stays {@link ReceivingStatusCell}.
   */
  linePhase?: 'expected' | 'landed';
  daysLate?: number | null;
  laneAgeLabel?: string | null;
  laneAgeHours?: number | null;
  ageTooltip?: string;
  markLabel?: string;
  trackingAction?: ReactNode;
};

/** Column model a cell may receive — Incoming keys stay a separate array. */
export type ReceivingGridCellColumn = ReceivingGridColumn | IncomingGridColumn;

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
  ctx?: ReceivingGridCellCtx,
): CSSProperties | undefined {
  if (!col.frozen) return undefined;
  return { left: gridFrozenLeft(ctx?.columns ?? RECEIVING_GRID_COLUMNS, col.key) };
}

/** `data-frozen-edge` only on the trailing frozen identity cell. */
export function receivingFrozenEdgeProps(
  col: ReceivingGridCellColumn,
): { 'data-frozen-edge'?: true } {
  return col.frozen && col.key === RECEIVING_GRID_FROZEN_EDGE_KEY
    ? { 'data-frozen-edge': true }
    : {};
}
