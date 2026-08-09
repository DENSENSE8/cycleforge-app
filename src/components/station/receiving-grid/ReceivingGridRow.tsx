'use client';

import { Fragment, memo, useState } from 'react';
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
import type { CustomFieldDef, CustomFieldValueMap } from '@/lib/custom-fields/types';
import {
  displayTrackingNumber,
  fulfillmentModeLabel,
  isLocalPickupFulfillment,
} from '@/lib/receiving/fulfillment-mode';
import { getReceivingPoIdentityParts } from '@/lib/receiving/po-group-title';
import { receivingCoarseStatusPaint } from '@/lib/receiving/rail/status';
import {
  workflowStageBadge,
  workflowStageLabel,
} from '@/lib/receiving/workflow-stages';
import {
  RECEIVING_GRID_COLUMNS,
  receivingGridRowShellClass,
  receivingGridTemplate,
  type ReceivingGridColumn,
} from '@/lib/receiving/receiving-grid-layout';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import { formatOpsStageTime } from '@/utils/date';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';
import type { GridColumnDisplayPref } from '@/design-system/components/grid';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import {
  displayReceivingProductTitle,
  receivingStageTooltip,
  renderReceivingGridCell,
  type ReceivingGridCellCtx,
} from './cells';
import { receivingActivityDateCell } from './receiving-grid-date';
import { ReceivingRowTriageContextMenu } from '@/components/receiving/unbox/compare/ReceivingRowTriageContextMenu';

interface ReceivingGridRowProps {
  row: ReceivingLineRow;
  index: number;
  isMobile: boolean;
  selectMode: boolean;
  /** This row is the focused record (workspace / read page). */
  isOpen: boolean;
  /** This row is checked into the bulk selection (gutter plane). */
  isChecked: boolean;
  /**
   * Unbox compare crosshair peer — same carton in another pane. Quieter wash
   * than selection; ignored when open/checked.
   */
  isLinked?: boolean;
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
  /** Compare host: report carton hover for linked crosshair. */
  onCrosshairHover?: (receivingId: number | null) => void;
  /** History / Unbox axis for the stage clock column. */
  activityAxis?: ReceivingActivityAxis;
  /** History / recent surface flag (mobile row chrome); dots use getStatusDotBg. */
  isHistory?: boolean;
  /**
   * Unbox / Receiving History → `'coarse'`. Testing History stays `'fine'`
   * so FAILED / PASSED remain visible. Default `'fine'`.
   */
  statusVocabulary?: 'fine' | 'coarse';
  /** Connected inventory provider label for History UNBOXED tips. */
  inventoryProviderLabel?: string;
  columns?: readonly ReceivingGridColumn[];
  columnDisplay?: Readonly<Record<string, GridColumnDisplayPref>>;
  /**
   * Unbox History click-select: body click toggles bulk; double-click / Enter
   * opens. When false, legacy split planes (body opens, gutter toggles) or
   * single-gesture apply.
   */
  clickSelect?: boolean;
  /**
   * When set (Unbox History triage), double-click / Enter call this instead of
   * `onSelect` so left-click can open the inspect rail while Enter opens work.
   */
  onOpenWorkspace?: () => void;
  /** Unbox History — richer column + row-state context menu. */
  historyTriageMenu?: boolean;
  /** Persisted custom row fill hex (Sheets paint). Selection wash outranks. */
  rowFillHex?: string | null;
  selectGutterChrome?: GridSelectGutterChrome;
  customFieldDefs?: readonly CustomFieldDef[];
  onCustomFieldCommit?: (entityId: number, defKey: string, next: string) => void;
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
  isLinked = false,
  onSelect,
  onToggle,
  onCrosshairHover,
  activityAxis = 'unboxed',
  isHistory = false,
  statusVocabulary = 'fine',
  inventoryProviderLabel = 'Inventory',
  columns = RECEIVING_GRID_COLUMNS,
  columnDisplay,
  clickSelect = false,
  onOpenWorkspace,
  historyTriageMenu = false,
  rowFillHex = null,
  selectGutterChrome = 'always',
  customFieldDefs,
  onCustomFieldCommit,
}: ReceivingGridRowProps) {
  useTimeFormat();
  const resolvePlatformMeta = usePlatformMeta();
  const [customOverlay, setCustomOverlay] = useState<CustomFieldValueMap>({});
  /** A gutter handler IS the signal that this surface split the two planes. */
  const splitPlanes = Boolean(onToggle) && !clickSelect;

  if (isMobile) {
    return (
      <ReceivingLineOrderRow
        row={row}
        index={index}
        isMobile
        isHistory={isHistory}
        statusVocabulary={statusVocabulary}
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
  const { poValue, platformLabel } = getReceivingPoIdentityParts(
    row,
    (raw) => resolvePlatformMeta(raw).label,
  );
  // Same raw ladder as getReceivingPoIdentityParts (source_platform → inbound).
  const platformMeta = resolvePlatformMeta(
    row.source_platform || row.inbound_source_type || null,
  );

  const coarsePaint =
    statusVocabulary === 'coarse'
      ? receivingCoarseStatusPaint(row, inventoryProviderLabel)
      : null;

  const customValues: CustomFieldValueMap = {
    ...(row.customFields ?? {}),
    ...customOverlay,
  };
  const rowForCells: ReceivingLineRow = {
    ...row,
    customFields: Object.keys(customValues).length > 0 ? customValues : row.customFields,
  };

  const ctx: ReceivingGridCellCtx = {
    row: rowForCells,
    selectMode,
    isSelected: isOpen || isChecked,
    isChecked,
    onToggle: clickSelect ? undefined : onToggle,
    activityAxis,
    isHistory,
    statusVocabulary,
    statusBadgeClass: coarsePaint?.badge ?? workflowStageBadge(row.workflow_status),
    productTitle: displayReceivingProductTitle(row),
    condGrade: (row.condition_grade || '').toUpperCase(),
    conditionLabel: conditionGradeTableLabel(row.condition_grade),
    stageDisplay: stageStamp?.instant ? formatOpsStageTime(stageStamp.instant) : null,
    stageLabel: coarsePaint?.label ?? workflowStageLabel(row.workflow_status),
    stageTip: stageStamp ? receivingStageTooltip(row, stageStamp, activityAxis) : '',
    dateCell: receivingActivityDateCell(stageStamp?.instant),
    poValue,
    platformLabel,
    platformMeta,
    isPickup: isLocalPickupFulfillment(row),
    pickupLabel: fulfillmentModeLabel(row),
    trackingValue: displayTrackingNumber(row) ?? '',
    onEditTracking: onSelect,
    onEditOrder: onSelect,
    serialsCsv: resolveReceivingLineSerialsCsv(row),
    statusDot:
      coarsePaint?.dot
      ?? getStatusDotBg(
        row.workflow_status,
        row.quantity_received,
        row.quantity_expected,
      ),
    inventoryProviderLabel,
    columnDisplay,
    selectGutterChrome,
    clickSelect,
    customFieldDefs,
    onCustomFieldCommit: onCustomFieldCommit
      ? (defKey, next) => {
          setCustomOverlay((prev) => ({ ...prev, [defKey]: next }));
          onCustomFieldCommit(row.id, defKey, next);
        }
      : undefined,
  };

  const selected = isOpen || isChecked;
  const rowEl = (
    <div
      data-line-row-id={row.id}
      data-order-row-id={String(row.id)}
      data-receiving-id={row.receiving_id ?? undefined}
      // Click-select: row IS the checkbox. Split planes: body opens (button).
      // Legacy single-gesture: checkbox role on the row.
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
          onToggle?.();
          return;
        }
        onSelect();
      }}
      onDoubleClick={() => {
        if (clickSelect) {
          onSelect();
          return;
        }
        onOpenWorkspace?.();
      }}
      onKeyDown={(event) => {
        if (clickSelect) {
          if (event.key === ' ') {
            event.preventDefault();
            onToggle?.();
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            onSelect();
            return;
          }
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          if (onOpenWorkspace) onOpenWorkspace();
          else onSelect();
          return;
        }
        if (event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      onPointerEnter={
        onCrosshairHover
          ? () => onCrosshairHover(row.receiving_id)
          : undefined
      }
      onPointerLeave={
        onCrosshairHover ? () => onCrosshairHover(null) : undefined
      }
      className={cn(
        receivingGridRowShellClass(false, { scrollMinContent: true }),
        // Same band as LedgerGridColumnHeader / Unbox chrome so the frozen
        // select header and the first body cells share one row rhythm.
        PRIMARY_CHROME_ROW_FACE,
        // Either plane fills the row; the gutter checkbox disambiguates which.
        // Linked peer wash is quieter than selection (compare crosshair).
        // Custom paint fill applies when not selected (selection wash wins).
        ledgerRowFillClass({
          selected,
          linked: isLinked,
          capabilities: RECEIVING_GRID_CAPABILITIES,
        }),
      )}
      style={{
        gridTemplateColumns: receivingGridTemplate(columns),
        ...(selected || !rowFillHex ? undefined : { backgroundColor: rowFillHex }),
      }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>
          {renderReceivingGridCell(col, i === columns.length - 1, ctx)}
        </Fragment>
      ))}
    </div>
  );

  return (
    <ReceivingRowTriageContextMenu row={row} historyTriage={historyTriageMenu}>
      {rowEl}
    </ReceivingRowTriageContextMenu>
  );
});
