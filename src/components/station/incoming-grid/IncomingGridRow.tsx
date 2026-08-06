'use client';

import { memo } from 'react';
import { IncomingAttachTrackingButton } from '@/components/station/IncomingAttachTrackingButton';
import { conditionGradeTableLabel } from '@/components/station/receiving-constants';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { ReceivingLineOrderRow } from '@/components/station/ReceivingLineOrderRow';
import {
  INCOMING_REMOVAL_REASON_FACE,
  resolveIncomingRemovalReasonForRow,
} from '@/lib/receiving/incoming-removal-reason';
import { INCOMING_GRID_CAPABILITIES } from '@/components/station/incoming-grid/incoming-grid-descriptor';
import { LedgerGridLeafRow } from '@/design-system/components/grid';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import {
  displayProductTitle,
  incomingDateCell,
  renderIncomingGridCell,
  type IncomingGridCellCtx,
} from './cells';
import { usePlatformMeta } from '@/hooks/useCatalog';
import {
  displayTrackingNumber,
  fulfillmentModeLabel,
  isLocalPickupFulfillment,
} from '@/lib/receiving/fulfillment-mode';
import {
  INCOMING_GRID_COLUMNS,
  incomingGridTemplate,
  incomingRowDateSource,
  type IncomingGridColumn,
} from '@/lib/receiving/incoming-grid-layout';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import {
  formatLaneAgeCompact,
  getDaysLateNullable,
  getLaneAgeHours,
} from '@/utils/date';

interface IncomingGridRowProps {
  row: ReceivingLineRow;
  index: number;
  isMobile: boolean;
  selectMode: boolean;
  /** This row is the record currently open in the Incoming inspector. */
  isOpen: boolean;
  /** This row is checked into the bulk selection. */
  isChecked: boolean;
  /** Opens the record (dblclick / Enter when clickSelect). */
  onSelect: () => void;
  /** Bulk membership (row click when clickSelect; gutter otherwise). */
  onToggle: () => void;
  /** Unbox Sheets click-select: click toggles; dblclick opens inspector. */
  clickSelect?: boolean;
  selectGutterChrome?: GridSelectGutterChrome;
  columns?: readonly IncomingGridColumn[];
}

/**
 * Incoming POS leaf row — CSS-grid columns matching {@link INCOMING_GRID_COLUMNS}.
 * Desktop cells live under `./cells/`; edit a column there, not here.
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
  clickSelect = false,
  selectGutterChrome = 'always',
  columns = INCOMING_GRID_COLUMNS,
}: IncomingGridRowProps) {
  const resolvePlatformMeta = usePlatformMeta();
  /** A gutter handler IS the signal that this surface split the two planes. */
  const splitPlanes = Boolean(onToggle) && !clickSelect;

  if (isMobile) {
    // Mobile keeps the legacy checkbox path (Receiving parity).
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
  const laneAgeLabelRaw = formatLaneAgeCompact(dateSource);
  const laneAgeHours = getLaneAgeHours(dateSource);
  const showLaneAge = Boolean(laneAgeLabelRaw) && daysLate === null;
  const ageTooltip =
    daysLate !== null
      ? `${daysLate} day${daysLate === 1 ? '' : 's'} past expected`
      : laneAgeLabelRaw
        ? `Age ${laneAgeLabelRaw}`
        : '';

  const platformRaw = (row.source_platform || row.inbound_source_type || '').trim();
  const platformMeta = platformRaw
    ? resolvePlatformMeta(platformRaw)
    : sourcePlatformMetaFromLabel(platformRaw);
  const markLabel = platformMeta.label || platformRaw || 'No platform';

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

  // Why this row left the lane — resolved through the shared registry, never a
  // map in this component. `null` on every lane but `incoming_removed`, where
  // the `removed` column is mounted.
  const removalReason = resolveIncomingRemovalReasonForRow(row);
  const removalFace = removalReason ? INCOMING_REMOVAL_REASON_FACE[removalReason] : null;

  const ctx: IncomingGridCellCtx = {
    row,
    productTitle,
    condGrade,
    conditionLabel,
    dateCell,
    daysLate,
    laneAgeLabel: showLaneAge ? laneAgeLabelRaw : null,
    laneAgeHours,
    ageTooltip,
    platformMeta,
    markLabel,
    poValue,
    isPickup,
    pickupLabel,
    trackingValue,
    trackingAction,
    onEditTracking: onSelect,
    removalFace,
    selectMode,
    isChecked,
    onToggle: clickSelect ? undefined : onToggle,
    selectGutterChrome,
    clickSelect,
  };

  return (
    <LedgerGridLeafRow
      data-line-row-id={row.id}
      data-order-row-id={String(row.id)}
      role={clickSelect ? 'checkbox' : splitPlanes ? 'button' : selectMode ? 'checkbox' : 'button'}
      tabIndex={0}
      aria-checked={
        clickSelect || (!splitPlanes && selectMode) ? isChecked : undefined
      }
      aria-pressed={
        clickSelect ? undefined : splitPlanes ? isOpen : selectMode ? undefined : isOpen
      }
      aria-label={
        clickSelect
          ? `Select receiving line ${row.id}`
          : splitPlanes || !selectMode
            ? `Open receiving line ${row.id}`
            : `Select receiving line ${row.id}`
      }
      onClick={(event) => {
        if (clickSelect) {
          // detail === 2 is the second half of a double-click — skip toggle so
          // dblclick only opens without deselecting.
          if (event.detail > 1) return;
          onToggle();
          return;
        }
        onSelect();
      }}
      onDoubleClick={() => {
        if (clickSelect) onSelect();
      }}
      onKeyDown={(event) => {
        if (clickSelect) {
          if (event.key === ' ') {
            event.preventDefault();
            onToggle();
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            onSelect();
            return;
          }
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      columns={columns}
      template={incomingGridTemplate(columns)}
      selected={isOpen || isChecked}
      capabilities={INCOMING_GRID_CAPABILITIES}
      renderCell={(col, { rule }) => renderIncomingGridCell(col, rule, ctx)}
    />
  );
});
