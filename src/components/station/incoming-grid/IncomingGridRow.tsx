'use client';

import { Fragment, memo, type ReactNode } from 'react';
import { Check } from '@/components/Icons';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import { IncomingAttachTrackingButton } from '@/components/station/IncomingAttachTrackingButton';
import {
  conditionGradeTableLabel,
  getStatusDotBg,
} from '@/components/station/receiving-constants';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { ReceivingLineOrderRow } from '@/components/station/ReceivingLineOrderRow';
import { OrderIdChip, TrackingChip, getLast4 } from '@/components/ui/CopyChip';
import {
  GridAgeCellValue,
  GridCellDash,
  GridDateCellValue,
  GridPlatformMarkValue,
} from '@/components/ui/grid-cells';
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
import {
  INCOMING_GRID_COLUMNS,
  INCOMING_GRID_FROZEN_CELL,
  incomingGridCell,
  incomingGridFrozenLeft,
  incomingGridRowShellClass,
  incomingGridTemplate,
  incomingRowDateSource,
  type IncomingGridColumn,
} from '@/lib/receiving/incoming-grid-layout';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import {
  formatDateKeyMedium,
  formatDateKeyShort,
  formatLaneAgeCompact,
  getDaysLateNullable,
  getLaneAgeHours,
  toPSTDateKey,
} from '@/utils/date';
import { cn } from '@/utils/_cn';
import { IncomingGridStatusCell } from './IncomingGridStatusCell';

interface IncomingGridRowProps {
  row: ReceivingLineRow;
  index: number;
  isMobile: boolean;
  selectMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
  columns?: readonly IncomingGridColumn[];
}

function incomingDateCell(source: string | null | undefined): {
  label: string;
  tooltip: string;
} | null {
  if (!source) return null;
  const key = toPSTDateKey(source);
  if (!key || key === 'Unknown') return null;
  const when = formatDateKeyMedium(key, { weekday: 'short', withYear: true });
  return {
    label: formatDateKeyShort(key),
    tooltip: when,
  };
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

/**
 * Incoming POS leaf row — CSS-grid columns matching {@link INCOMING_GRID_COLUMNS}.
 * Mobile falls back to the legacy {@link ReceivingLineOrderRow} stack.
 */
export const IncomingGridRow = memo(function IncomingGridRow({
  row,
  index,
  isMobile,
  selectMode,
  isSelected,
  onSelect,
  columns = INCOMING_GRID_COLUMNS,
}: IncomingGridRowProps) {
  const resolvePlatformMeta = usePlatformMeta();

  if (isMobile) {
    return (
      <ReceivingLineOrderRow
        row={row}
        index={index}
        isMobile
        isIncoming
        selectMode={selectMode}
        isSelected={isSelected}
        onSelect={onSelect}
      />
    );
  }

  const productTitle = displayProductTitle(row);
  const quantityText = `${row.quantity_received}/${row.quantity_expected ?? '?'}`;
  const qtyExpected = row.quantity_expected ?? 0;
  const condGrade = (row.condition_grade || '').toUpperCase();
  const conditionLabel = conditionGradeTableLabel(row.condition_grade);
  const dateSource = incomingRowDateSource(row);
  const dateCell = incomingDateCell(dateSource);
  const daysLate = getDaysLateNullable(dateSource);
  const laneAgeLabel = formatLaneAgeCompact(dateSource);
  const laneAgeHours = getLaneAgeHours(dateSource);
  const showLaneAge = Boolean(laneAgeLabel) && daysLate === null;
  const ageTooltip =
    daysLate !== null
      ? `${daysLate} day${daysLate === 1 ? '' : 's'} past expected`
      : laneAgeLabel
        ? `Age ${laneAgeLabel}`
        : '';

  const platformRaw = (row.source_platform || row.inbound_source_type || '').trim();
  const platformResolved = platformRaw ? resolvePlatformMeta(platformRaw) : null;
  const platformMeta = sourcePlatformMetaFromLabel(platformResolved?.label || platformRaw);
  const markLabel = platformResolved?.label || platformRaw || 'No platform';

  const poValue = (
    row.zoho_purchaseorder_number ||
    row.zoho_purchaseorder_id ||
    row.source_order_id ||
    ''
  ).trim();

  const isPickup = isLocalPickupFulfillment(row);
  const pickupLabel = fulfillmentModeLabel(row);
  const trackingValue = displayTrackingNumber(row) ?? '';
  const trackingAction =
    row.delivery_state === 'AWAITING_TRACKING' && (row.zoho_purchaseorder_id || '').trim()
      ? (
          <IncomingAttachTrackingButton
            poId={(row.zoho_purchaseorder_id || '').trim()}
            poNumber={row.zoho_purchaseorder_number}
          />
        )
      : undefined;

  const dataCell = (col: IncomingGridColumn, rule = true) =>
    cn(incomingGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));

  const ageNode = (
    <GridAgeCellValue
      daysLate={daysLate}
      laneAgeLabel={showLaneAge ? laneAgeLabel : null}
      laneAgeHours={laneAgeHours}
      tooltip={ageTooltip}
      className="text-role-caption"
    />
  );

  const statusDot = getStatusDotBg(
    row.workflow_status,
    row.quantity_received,
    row.quantity_expected,
  );

  const renderCell = (col: IncomingGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return (
          <div
            className={cn(
              incomingGridCell({ inset: 'none', rule: true }),
              INCOMING_GRID_FROZEN_CELL,
              'justify-center',
            )}
            style={{ left: incomingGridFrozenLeft('select') }}
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
            className={cn(dataCell(col, rule), INCOMING_GRID_FROZEN_CELL, 'gap-1.5')}
            style={{ left: incomingGridFrozenLeft('title') }}
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
      case 'age':
        return (
          <div data-col="age" className={dataCell(col, rule)}>
            {ageNode}
          </div>
        );
      case 'qty':
        return (
          <div data-col="qty" className={dataCell(col, rule)}>
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
      case 'status':
        return (
          <div data-col="status" className={cn(dataCell(col, rule), 'gap-1')}>
            <IncomingGridStatusCell row={row} />
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
              trackingAction ?? <GridCellDash />
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
        incomingGridRowShellClass(false, { scrollMinContent: true }),
        ledgerRowStateClass(isSelected),
      )}
      style={{ gridTemplateColumns: incomingGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
