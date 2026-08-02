'use client';

import { Fragment, memo, type ReactNode } from 'react';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import { IncomingAttachTrackingButton } from '@/components/station/IncomingAttachTrackingButton';
import {
  conditionGradeTableLabel,
  getStatusDotBg,
} from '@/components/station/receiving-constants';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { ReceivingLineOrderRow } from '@/components/station/ReceivingLineOrderRow';
import { OrderIdChip, TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import {
  GridAgeCellValue,
  GridDateCellValue,
  GridPlatformMarkValue,
  GridQtyFractionValue,
} from '@/components/ui/grid-cells';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import { INCOMING_GRID_CAPABILITIES } from '@/components/station/incoming-grid/incoming-grid-descriptor';
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
  /** This row is the record currently open in the Incoming inspector. */
  isOpen: boolean;
  /** This row is checked into the bulk selection (gutter plane). */
  isChecked: boolean;
  /** Row-body activate — opens the record. */
  onSelect: () => void;
  /** Gutter checkbox — bulk membership only. */
  onToggle: () => void;
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
  isOpen,
  isChecked,
  onSelect,
  onToggle,
  columns = INCOMING_GRID_COLUMNS,
}: IncomingGridRowProps) {
  const resolvePlatformMeta = usePlatformMeta();

  if (isMobile) {
    // The mobile stack splits the planes the same way: the leading checkbox is
    // a real control, the tap opens the record. Passing `onToggleSelect` is what
    // keeps bulk reachable there — without it the phone would show a checkbox
    // it could no longer tick.
    return (
      <ReceivingLineOrderRow
        row={row}
        index={index}
        isMobile
        isIncoming
        selectMode={selectMode}
        isSelected={isOpen || isChecked}
        isChecked={isChecked}
        onSelect={onSelect}
        onToggleSelect={onToggle}
      />
    );
  }

  const productTitle = displayProductTitle(row);
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
          >
            {selectMode ? (
              // The gutter is the multi-select plane and owns its own click —
              // it used to `stopPropagation` with no handler of its own, so the
              // checkbox was inert and the whole ROW toggled it instead.
              <GridRowCheckbox
                checked={isChecked}
                onToggle={onToggle}
                label={`Select receiving line ${row.id} for bulk actions`}
              />
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
            <GridQtyFractionValue
              received={row.quantity_received}
              expected={row.quantity_expected}
            />
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
            <OrderIdChip
              value={poValue}
              display={getLast8(poValue)}
              plain
              truncateDisplay={false}
              fitDisplayWidth
            />
          </div>
        );
      case 'tracking':
        return (
          <div data-col="tracking" className={dataCell(col, rule)}>
            {isPickup && pickupLabel ? (
              <FulfillmentPickupPill dense />
            ) : !trackingValue && trackingAction ? (
              trackingAction
            ) : (
              <TrackingChip
                value={trackingValue}
                showIcon={!col.omitCellIcon}
              />
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
      // The row body is the RECORD plane — always a button that opens the
      // inspector. The checkbox semantics moved to the gutter cell, where the
      // affordance actually is; the row used to claim `role="checkbox"` for the
      // whole width whenever select mode was on, which is what made "open" an
      // unreachable gesture on this surface.
      role="button"
      tabIndex={0}
      aria-pressed={isOpen}
      aria-label={`Open receiving line ${row.id}`}
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
        // Either plane fills the row — the gutter checkbox is what tells the
        // operator which one. Selection is fill-only here (no ring): an inset
        // ring fights the airtable cell rules (`queue-row-chrome.ts`).
        ledgerRowFillClass({
          selected: isOpen || isChecked,
          capabilities: INCOMING_GRID_CAPABILITIES,
        }),
      )}
      style={{ gridTemplateColumns: incomingGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
