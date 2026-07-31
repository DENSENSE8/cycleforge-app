'use client';

import { Fragment, memo } from 'react';
import {
  conditionGradeTableLabel,
  getStatusDotBg,
} from '@/components/station/receiving-constants';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { resolveReceivingLineSerialsCsv } from '@/components/station/receiving-line-serials';
import {
  resolveReceivingRowStageStamp,
  type ReceivingActivityAxis,
} from '@/components/station/receiving-lines-table-helpers';
import { ReceivingLineOrderRow } from '@/components/station/ReceivingLineOrderRow';
import { ledgerRowStateClass } from '@/components/ui/queue-row-chrome';
import { usePlatformMeta } from '@/hooks/useCatalog';
import {
  displayTrackingNumber,
  fulfillmentModeLabel,
  isLocalPickupFulfillment,
} from '@/lib/receiving/fulfillment-mode';
import { getReceivingPoIdentityParts } from '@/lib/receiving/po-group-title';
import {
  RECEIVING_GRID_COLUMNS,
  receivingGridRowShellClass,
  receivingGridTemplate,
  type ReceivingGridColumn,
} from '@/lib/receiving/receiving-grid-layout';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import { formatOpsStageTime } from '@/utils/date';
import { cn } from '@/utils/_cn';
import {
  displayReceivingProductTitle,
  receivingStageTooltip,
  renderReceivingGridCell,
  type ReceivingGridCellCtx,
} from './cells';
import { receivingActivityDateCell } from './receiving-grid-date';

interface ReceivingGridRowProps {
  row: ReceivingLineRow;
  index: number;
  isMobile: boolean;
  selectMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  /** History / Unbox axis for the stage clock column. */
  activityAxis?: ReceivingActivityAxis;
  /** History reads the status dot as uniform received-green. */
  isHistory?: boolean;
  columns?: readonly ReceivingGridColumn[];
}

/**
 * Unbox / History / Testing leaf row — CSS-grid columns matching
 * {@link RECEIVING_GRID_COLUMNS}. Desktop cells live under `./cells/`;
 * mobile falls back to {@link ReceivingLineOrderRow}.
 *
 * Agent waist: edit a column → open that `cells/*Cell.tsx` only
 * (skill `receiving-grid-cell`). Do not load PoLine / Orders / Incoming.
 */
export const ReceivingGridRow = memo(function ReceivingGridRow({
  row,
  index,
  isMobile,
  selectMode,
  isSelected,
  onSelect,
  activityAxis = 'unboxed',
  isHistory = false,
  columns = RECEIVING_GRID_COLUMNS,
}: ReceivingGridRowProps) {
  useTimeFormat();
  const resolvePlatformMeta = usePlatformMeta();

  if (isMobile) {
    return (
      <ReceivingLineOrderRow
        row={row}
        index={index}
        isMobile
        isHistory={isHistory}
        activityAxis={activityAxis}
        selectMode={selectMode}
        isSelected={isSelected}
        onSelect={onSelect}
      />
    );
  }

  const stageStamp = resolveReceivingRowStageStamp(row, activityAxis);
  const platformRaw = (row.source_platform || row.inbound_source_type || '').trim();
  const platformResolved = platformRaw ? resolvePlatformMeta(platformRaw) : null;
  const platformMeta = sourcePlatformMetaFromLabel(platformResolved?.label || platformRaw);
  const { poValue } = getReceivingPoIdentityParts(row, (raw) => resolvePlatformMeta(raw).label);

  const ctx: ReceivingGridCellCtx = {
    row,
    selectMode,
    isSelected,
    activityAxis,
    isHistory,
    productTitle: displayReceivingProductTitle(row),
    condGrade: (row.condition_grade || '').toUpperCase(),
    conditionLabel: conditionGradeTableLabel(row.condition_grade),
    stageDisplay: stageStamp?.instant ? formatOpsStageTime(stageStamp.instant) : null,
    stageTip: stageStamp ? receivingStageTooltip(row, stageStamp, activityAxis) : '',
    dateCell: receivingActivityDateCell(stageStamp?.instant),
    platformMeta,
    markLabel: platformResolved?.label || platformRaw || 'No platform',
    poValue,
    isPickup: isLocalPickupFulfillment(row),
    pickupLabel: fulfillmentModeLabel(row),
    trackingValue: displayTrackingNumber(row) ?? '',
    serialsCsv: resolveReceivingLineSerialsCsv(row),
    statusDot: isHistory
      ? 'bg-emerald-500'
      : getStatusDotBg(row.workflow_status, row.quantity_received, row.quantity_expected),
  };

  return (
    <div
      data-line-row-id={row.id}
      data-order-row-id={String(row.id)}
      role={selectMode ? 'checkbox' : 'button'}
      tabIndex={0}
      aria-checked={selectMode ? isSelected : undefined}
      aria-pressed={selectMode ? undefined : isSelected}
      aria-label={`Select receiving line ${row.id}`}
      onClick={() => {
        onSelect();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        receivingGridRowShellClass(false, { scrollMinContent: true }),
        ledgerRowStateClass(isSelected),
      )}
      style={{ gridTemplateColumns: receivingGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>
          {renderReceivingGridCell(col, i === columns.length - 1, ctx)}
        </Fragment>
      ))}
    </div>
  );
});
