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
import { ignoreRowSelectFromSubtitle } from '@/components/tables/compound/useSubtitlePointerReorder';
import { CompoundRowDetailHost } from '@/components/tables/compound/CompoundRowDetailHost';
import { useCompoundRowDetail } from '@/components/tables/compound/useCompoundRowDetail';
import { isCompoundColumnModel } from '@/components/tables/compound/compound-columns';
import { usePlatformMeta } from '@/hooks/useCatalog';
import type { CustomFieldDef } from '@/lib/custom-fields/types';
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
import { cn } from '@/utils/_cn';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import {
  displayReceivingProductTitle,
  receivingCompoundRowView,
  receivingStageTooltip,
  renderReceivingGridCell,
  type ReceivingGridCellCtx,
} from './cells';
import { receivingActivityDateCell } from './receiving-grid-date';

interface ReceivingGridRowProps {
  /** Fold parent is speaking the PO/order — dash it here. */
  quietIdentity?: boolean;
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
  subtitleFieldIds?: readonly string[];
  /** Inline note edit. Absent ⇒ the note line is read-only on this surface. */
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
  clickSelect = false,
  onOpenWorkspace,
  historyTriageMenu = false,
  rowFillHex = null,
  quietIdentity = false,
  selectGutterChrome = 'always',
  customFieldDefs,
  subtitleFieldIds: _subtitleFieldIds,
}: ReceivingGridRowProps) {
  useTimeFormat();
  const resolvePlatformMeta = usePlatformMeta();
  /** A gutter handler IS the signal that this surface split the two planes. */
  const splitPlanes = Boolean(onToggle) && !clickSelect;
  const detailState = useCompoundRowDetail(String(row.id));

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

  // No optimistic overlay: the cells are read-only, so the only writer for
  // `customFields` is the fetch that produced the row.
  const rowForCells: ReceivingLineRow = row;

  const ctx: ReceivingGridCellCtx = {
    row: rowForCells,
    // The MOUNTED model — a cell's sticky-left derives from it, so this row
    // shell works identically under the flat and the compound column arrays.
    columns,
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
    quietIdentity,
    platformLabel,
    platformMeta,
    isPickup: isLocalPickupFulfillment(row),
    pickupLabel: fulfillmentModeLabel(row),
    trackingValue: displayTrackingNumber(row) ?? '',
    onEditTracking: onSelect,
    onEditOrder: onSelect,
    // Double-click's destination, reused by the compound chevron.
    onOpenRecord: onOpenWorkspace,
    serialsCsv: resolveReceivingLineSerialsCsv(row),
    statusDot:
      coarsePaint?.dot
      ?? getStatusDotBg(
        row.workflow_status,
        row.quantity_received,
        row.quantity_expected,
      ),
    inventoryProviderLabel,
    selectGutterChrome,
    clickSelect,
    customFieldDefs,
  };

  const selected = isOpen || isChecked;
  const compound = isCompoundColumnModel(columns);
  const compoundView = compound ? receivingCompoundRowView(ctx) : null;
  const detailChrome =
    compoundView?.detail != null
      ? {
          open: detailState.open,
          onToggle: detailState.toggle,
          label: compoundView.title.trim() || 'this line',
        }
      : undefined;

  const rowEl = (
    <div
      data-line-row-id={row.id}
      data-order-row-id={String(row.id)}
      data-receiving-id={row.receiving_id ?? undefined}
      data-group-child={quietIdentity ? '' : undefined}
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
        if (ignoreRowSelectFromSubtitle(event)) return;
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
        // Named hover group — the compound layout's chevron reveals on row
        // hover. Inert for the flat model (nothing there consumes it).
        'group/row',
        // NO fixed row height. The row box is owned by the compound cell
        // (`COMPOUND_ROW_PX`), exactly as it is on To-Ship, so both tables
        // measure the same.
        //
        // This carried `PRIMARY_CHROME_ROW_FACE` (`h-7 shrink-0` = 28px) to
        // share a rhythm with the column header. That is a HEADER band constant,
        // and pinning a BODY row to it is what collapsed Receiving to a single
        // visible line while To-Ship — which never had the class — rendered
        // both: a 48px compound cell inside a 28px `shrink-0` row overflows, and
        // the shell's `[contain:layout_style]` clips it silently. A body row's
        // height is a property of what it contains.
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
          {renderReceivingGridCell(col, i === columns.length - 1, ctx, detailChrome)}
        </Fragment>
      ))}
    </div>
  );

  if (!compoundView?.detail) return rowEl;

  return (
    <CompoundRowDetailHost
      rowId={String(row.id)}
      detail={compoundView.detail}
      title={compoundView.title}
      columns={columns}
      detailOpen={detailState.open}
      onCloseDetail={detailState.close}
    >
      {rowEl}
    </CompoundRowDetailHost>
  );
});
