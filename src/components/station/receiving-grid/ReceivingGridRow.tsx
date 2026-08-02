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
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { RECEIVING_GRID_CAPABILITIES } from '@/components/station/receiving-grid/receiving-grid-descriptor';
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
import type { GridColumnDisplayPref } from '@/design-system/components/grid';
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
  /** This row is the focused record (workspace / read page). */
  isOpen: boolean;
  /** This row is checked into the bulk selection (gutter plane). */
  isChecked: boolean;
  /** Row-body activate — opens the record where the planes are split. */
  onSelect: () => void;
  /**
   * Gutter checkbox — bulk membership only. Its PRESENCE is what says this
   * surface splits the two planes: the gutter becomes a real control and the
   * row stops claiming `role="checkbox"`. Omitted (Unbox workbench, Testing
   * history, Pickup) → the legacy single-gesture row, where the click ticks the
   * box and the gutter is a painted span.
   */
  onToggle?: () => void;
  /** History / Unbox axis for the stage clock column. */
  activityAxis?: ReceivingActivityAxis;
  /** History reads the status dot as uniform received-green. */
  isHistory?: boolean;
  columns?: readonly ReceivingGridColumn[];
  columnDisplay?: Readonly<Record<string, GridColumnDisplayPref>>;
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
  isOpen,
  isChecked,
  onSelect,
  onToggle,
  activityAxis = 'unboxed',
  isHistory = false,
  columns = RECEIVING_GRID_COLUMNS,
  columnDisplay,
}: ReceivingGridRowProps) {
  useTimeFormat();
  const resolvePlatformMeta = usePlatformMeta();
  /** A gutter handler IS the signal that this surface split the two planes. */
  const splitPlanes = Boolean(onToggle);

  if (isMobile) {
    return (
      <ReceivingLineOrderRow
        row={row}
        index={index}
        isMobile
        isHistory={isHistory}
        activityAxis={activityAxis}
        selectMode={selectMode}
        isSelected={isOpen || isChecked}
        isChecked={isChecked}
        onSelect={onSelect}
        onToggleSelect={onToggle}
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
    isSelected: isOpen || isChecked,
    isChecked,
    onToggle,
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
    columnDisplay,
  };

  return (
    <div
      data-line-row-id={row.id}
      data-order-row-id={String(row.id)}
      // Semantics follow the gesture, and the gesture depends on whether this
      // surface splits the planes (`onToggle` present). Split → the body is the
      // RECORD plane and the checkbox role lives on the gutter cell where the
      // affordance actually is. Not split → the click still ticks the box, so
      // announcing a button would be a lie.
      role={splitPlanes ? 'button' : selectMode ? 'checkbox' : 'button'}
      tabIndex={0}
      aria-checked={!splitPlanes && selectMode ? isChecked : undefined}
      aria-pressed={splitPlanes ? isOpen : selectMode ? undefined : isOpen}
      aria-label={
        splitPlanes || !selectMode
          ? `Open receiving line ${row.id}`
          : `Select receiving line ${row.id}`
      }
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
        // Either plane fills the row; the gutter checkbox disambiguates which.
        ledgerRowFillClass({
          selected: isOpen || isChecked,
          capabilities: RECEIVING_GRID_CAPABILITIES,
        }),
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
