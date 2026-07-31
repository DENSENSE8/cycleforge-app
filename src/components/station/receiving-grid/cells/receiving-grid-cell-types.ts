/**
 * Shared context for Unbox / History / Testing LedgerGrid cell renderers.
 * Row shell builds this once; cells stay column-scoped.
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { ReceivingActivityAxis } from '@/components/station/receiving-lines-table-helpers';
import { gridCellAlignClass } from '@/design-system/components/grid';
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
  isSelected: boolean;
  activityAxis: ReceivingActivityAxis;
  isHistory: boolean;
  productTitle: string;
  conditionLabel: string;
  condGrade: string;
  stageDisplay: string | null;
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
};

export type ReceivingGridCellProps = {
  col: ReceivingGridColumn;
  /** When false, omit the trailing column rule (last visible column). */
  rule: boolean;
  ctx: ReceivingGridCellCtx;
};

export function receivingDataCellClass(col: ReceivingGridColumn, rule = true): string {
  return cn(receivingGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));
}
