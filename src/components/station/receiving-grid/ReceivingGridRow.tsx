'use client';

import { Fragment, memo, type ReactNode } from 'react';
import { Check } from '@/components/Icons';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
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
import { OrderIdChip, SerialChip, TrackingChip, getLast4 } from '@/components/ui/CopyChip';
import {
  GridCellDash,
  GridDateCellValue,
  GridPlatformMarkValue,
} from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ledgerRowStateClass } from '@/components/ui/queue-row-chrome';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { EMPTY_META_DASH, EMPTY_META_DASH_ALIGN_CLASS } from '@/lib/conditions';
import {
  displayTrackingNumber,
  fulfillmentModeLabel,
  isLocalPickupFulfillment,
} from '@/lib/receiving/fulfillment-mode';
import { getReceivingPoIdentityParts } from '@/lib/receiving/po-group-title';
import {
  RECEIVING_GRID_COLUMNS,
  RECEIVING_GRID_FROZEN_CELL,
  receivingGridCell,
  receivingGridFrozenLeft,
  receivingGridRowShellClass,
  receivingGridTemplate,
  type ReceivingGridColumn,
} from '@/lib/receiving/receiving-grid-layout';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import { formatDateTimePST, formatOpsStageTime } from '@/utils/date';
import { cn } from '@/utils/_cn';
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

function displayProductTitle(row: ReceivingLineRow): string {
  return (
    row.catalog_product_title ||
    row.zoho_item_title ||
    row.item_name ||
    row.zoho_item_id ||
    'Unnamed inbound line'
  );
}

function receivingStageTooltip(
  row: ReceivingLineRow,
  stamp: NonNullable<ReturnType<typeof resolveReceivingRowStageStamp>>,
  axis: ReceivingActivityAxis,
): string {
  const primaryAbs = formatDateTimePST(stamp.instant);
  const parts = [
    stamp.staffName ? `${stamp.label} ${primaryAbs} by ${stamp.staffName}` : `${stamp.label} ${primaryAbs}`,
  ];
  if (axis === 'unboxed') {
    const scanInstant = (row.scanned_at || row.received_at || '').trim();
    if (scanInstant) {
      const scanAbs = formatDateTimePST(scanInstant);
      const by =
        (row.scanned_by_name || '').trim() ||
        (row.received_by_name || '').trim() ||
        '';
      parts.push(by ? `Scanned ${scanAbs} by ${by}` : `Scanned ${scanAbs}`);
    }
  } else if (axis === 'scanned') {
    const unboxed = (row.unboxed_at || '').trim();
    if (unboxed) {
      const abs = formatDateTimePST(unboxed);
      const by = (row.unboxed_by_name || '').trim();
      parts.push(by ? `Unboxed ${abs} by ${by}` : `Unboxed ${abs}`);
    }
  }
  return parts.join(' · ');
}

/**
 * Unbox / History / Testing leaf row — CSS-grid columns matching
 * {@link RECEIVING_GRID_COLUMNS}. Mobile falls back to {@link ReceivingLineOrderRow}.
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

  const productTitle = displayProductTitle(row);
  const quantityText = `${row.quantity_received}/${row.quantity_expected ?? '?'}`;
  const quantityTip =
    row.quantity_expected == null
      ? `${row.quantity_received} received · expected count unknown (no PO line matched yet)`
      : `${row.quantity_received} of ${row.quantity_expected} received`;
  const qtyExpected = row.quantity_expected ?? 0;
  const condGrade = (row.condition_grade || '').toUpperCase();
  const conditionLabel = conditionGradeTableLabel(row.condition_grade);
  const stageStamp = resolveReceivingRowStageStamp(row, activityAxis);
  const stageDisplay = stageStamp?.instant ? formatOpsStageTime(stageStamp.instant) : null;
  const stageTip = stageStamp ? receivingStageTooltip(row, stageStamp, activityAxis) : '';
  const dateCell = receivingActivityDateCell(stageStamp?.instant);

  const platformRaw = (row.source_platform || row.inbound_source_type || '').trim();
  const platformResolved = platformRaw ? resolvePlatformMeta(platformRaw) : null;
  const platformMeta = sourcePlatformMetaFromLabel(platformResolved?.label || platformRaw);
  const markLabel = platformResolved?.label || platformRaw || 'No platform';

  const { poValue } = getReceivingPoIdentityParts(row, (raw) => resolvePlatformMeta(raw).label);

  const isPickup = isLocalPickupFulfillment(row);
  const pickupLabel = fulfillmentModeLabel(row);
  const trackingValue = displayTrackingNumber(row) ?? '';
  const serialsCsv = resolveReceivingLineSerialsCsv(row);

  const dataCell = (col: ReceivingGridColumn, rule = true) =>
    cn(receivingGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

  const statusDot = isHistory
    ? 'bg-emerald-500'
    : getStatusDotBg(row.workflow_status, row.quantity_received, row.quantity_expected);

  const renderCell = (col: ReceivingGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              receivingGridCell({ inset: 'none', rule: true }),
              RECEIVING_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: receivingGridFrozenLeft('select') }}
            onClick={(e) => {
              if (selectMode) e.stopPropagation();
            }}
          >
            {selectMode ? (
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                  isSelected
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-border-default bg-surface-card',
                )}
                aria-hidden
              >
                {isSelected ? <Check className="h-3 w-3" /> : null}
              </span>
            ) : (
              <span className="h-4 w-4 shrink-0" aria-hidden />
            )}
          </div>
        );
      case 'title':
        // Identity column — collection-map read-only
        // (`isGridColumnInCellEditable` / GRID_IDENTITY_COLUMN_KEYS). Clicks
        // fall through to the row (open record); title correction is rematch /
        // catalog at the record plane, not an in-cell caret.
        return (
          <div
            data-col="title"
            className={cn(dataCell(col, rule), RECEIVING_GRID_FROZEN_CELL, 'gap-1.5')}
            style={{ left: receivingGridFrozenLeft('title') }}
            data-frozen-edge
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDot)} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
              {productTitle}
            </span>
          </div>
        );
      case 'date':
        return (
          <div data-col="date" className={dataCell(col, rule)}>
            <GridDateCellValue
              label={dateCell?.label}
              tooltip={dateCell?.tooltip}
              className="text-role-caption"
            />
          </div>
        );
      case 'qty':
        return (
          <div data-col="qty" className={dataCell(col, rule)}>
            {/* `received/expected`, and the `?` is load-bearing: an unfound PO has
                no expected count, so `0/?` means "nothing received, and we do not
                know what to expect" — not "zero of zero". Every other cryptic
                value in this grid explains itself on hover; this one did not. */}
            <HoverTooltip label={quantityTip} focusable={false}>
              <span
                className={cn(
                  'min-w-0 truncate tabular-nums text-role-caption',
                  qtyExpected > 1
                    ? 'text-text-warning'
                    : row.quantity_expected && row.quantity_received >= row.quantity_expected
                      ? 'text-emerald-600'
                      : 'text-text-muted',
                )}
              >
                {quantityText}
              </span>
            </HoverTooltip>
          </div>
        );
      case 'condition':
        return (
          <div data-col="condition" className={dataCell(col, rule)}>
            <span
              className={cn(
                'min-w-0 truncate text-role-eyebrow uppercase',
                conditionGradeTextClass(condGrade),
                conditionLabel === EMPTY_META_DASH && EMPTY_META_DASH_ALIGN_CLASS,
              )}
            >
              {conditionLabel}
            </span>
          </div>
        );
      case 'stage':
        return (
          <div data-col="stage" className={dataCell(col, rule)}>
            {stageDisplay && stageDisplay !== '--:--' ? (
              <HoverTooltip label={stageTip} focusable={false}>
                {/* `text-muted`, not `faint`: this is the stamp an operator reads
                    when adjudicating "when was this unboxed, and by whom". At
                    `faint` it dropped out entirely on a warehouse monitor viewed
                    from a few feet — the quietest value on the row was the one
                    the column exists to show. */}
                <span className="truncate tabular-nums text-role-caption text-text-muted">
                  {stageDisplay}
                </span>
              </HoverTooltip>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'platform':
        return (
          <div data-col="platform" className={dataCell(col, rule)}>
            <GridPlatformMarkValue platformValue={platformMeta.value} label={markLabel} />
          </div>
        );
      case 'order':
        return (
          <div data-col="order" className={dataCell(col, rule)}>
            {poValue ? (
              <OrderIdChip
                value={poValue}
                display={getLast4(poValue)}
                plain
                truncateDisplay={false}
                fitDisplayWidth
              />
            ) : null}
          </div>
        );
      case 'tracking':
        return (
          <div data-col="tracking" className={dataCell(col, rule)}>
            {isPickup && pickupLabel ? (
              <FulfillmentPickupPill dense />
            ) : trackingValue ? (
              <TrackingChip
                value={trackingValue}
                display={getLast4(trackingValue)}
                showIcon={!col.omitCellIcon}
              />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'serial':
        return (
          <div data-col="serial" className={dataCell(col, rule)}>
            {serialsCsv ? (
              <SerialChip value={serialsCsv} width="w-auto shrink-0" dense />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
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
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
