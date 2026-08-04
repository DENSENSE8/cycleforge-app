'use client';

import { Fragment, type ReactNode } from 'react';
import {
  conditionGradeTableLabel,
  getStatusDotBg,
} from '@/components/station/receiving-constants';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import {
  OrderIdChip,
  SerialChip,
  SerialCountChip,
  TrackingChip,
  TrackingCountChip,
  getLast8,
} from '@/components/ui/CopyChip';
import {
  GridCellDash,
  GridDateCellValue,
  GridPlatformMarkValue,
  GridStatusCellValue,
} from '@/components/ui/grid-cells';
import {
  GridRowCheckbox,
  isEmptyGutterChrome,
  type GridSelectGutterChrome,
} from '@/components/ui/GridRowCheckbox';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { EMPTY_META_DASH, EMPTY_META_DASH_ALIGN_CLASS } from '@/lib/conditions';
import {
  displayTrackingNumber,
  isLocalPickupFulfillment,
} from '@/lib/receiving/fulfillment-mode';
import {
  getReceivingPoGroupTitle,
  getReceivingPoIdentityParts,
} from '@/lib/receiving/po-group-title';
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
import { workflowStageBadge, workflowStageLabel } from '@/lib/receiving/workflow-stages';
import { formatOpsStageTime } from '@/utils/date';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { cn } from '@/utils/_cn';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { ReceivingPoSummary } from '@/components/station/ReceivingPoSummary';
import {
  resolveReceivingRowStageStamp,
  type ReceivingActivityAxis,
} from '@/components/station/receiving-lines-table-helpers';
import { resolveReceivingLineSerialsCsv } from '@/components/station/receiving-line-serials';
import { receivingActivityDateCell } from './receiving-grid-date';

/**
 * Collapsed multi-line PO header for Unbox / History LedgerGrid — same column
 * tracks as {@link ReceivingGridRow}. Mobile falls back to {@link ReceivingPoSummary}.
 */
export function ReceivingGridGroupSummary({
  rows,
  isMobile,
  columns = RECEIVING_GRID_COLUMNS,
  activityAxis = 'unboxed',
  isHistory = false,
  selectMode = false,
  allSelected = false,
  someSelected = false,
  onToggleGroupSelect,
  selectGutterChrome = 'always',
  clickSelect = false,
}: {
  rows: ReceivingLineRow[];
  isMobile: boolean;
  columns?: readonly ReceivingGridColumn[];
  activityAxis?: ReceivingActivityAxis;
  isHistory?: boolean;
  selectMode?: boolean;
  allSelected?: boolean;
  someSelected?: boolean;
  onToggleGroupSelect?: () => void;
  selectGutterChrome?: GridSelectGutterChrome;
  /** Unbox History: empty select spacer; select-all is header-only. */
  clickSelect?: boolean;
}) {
  useTimeFormat();
  const resolvePlatformMeta = usePlatformMeta();

  if (isMobile) {
    return (
      <ReceivingPoSummary
        rows={rows}
        isMobile
        isIncoming={false}
        isHistory={isHistory}
        activityAxis={activityAxis}
      />
    );
  }

  const first = rows[0];
  const resolvePlatformLabel = (raw: string) => resolvePlatformMeta(raw).label;
  const title = getReceivingPoGroupTitle(first, resolvePlatformLabel);
  const { poValue } = getReceivingPoIdentityParts(first, resolvePlatformLabel);

  const received = rows.reduce((sum, r) => sum + (r.quantity_received || 0), 0);
  const expected = rows.reduce((sum, r) => sum + (r.quantity_expected ?? 0), 0);
  const quantityText = `${received}/${expected || '?'}`;
  const complete = expected > 0 && received >= expected;

  const grades = new Set(
    rows.map((r) => (r.condition_grade || '').toUpperCase()).filter(Boolean),
  );
  const conditionLabel =
    grades.size === 1 ? conditionGradeTableLabel([...grades][0]) : grades.size > 1 ? 'MIXED' : EMPTY_META_DASH;
  const condGrade = grades.size === 1 ? [...grades][0] : '';

  // Newest stage stamp across the fold (ops scan).
  let bestStamp: ReturnType<typeof resolveReceivingRowStageStamp> = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const r of rows) {
    const stamp = resolveReceivingRowStageStamp(r, activityAxis);
    if (!stamp?.instant) continue;
    const ms = new Date(stamp.instant).getTime();
    if (!Number.isFinite(ms) || ms <= bestMs) continue;
    bestMs = ms;
    bestStamp = stamp;
  }
  const stageDisplay = bestStamp?.instant ? formatOpsStageTime(bestStamp.instant) : null;
  const dateCell = receivingActivityDateCell(bestStamp?.instant);

  const platformRaw = (first.source_platform || first.inbound_source_type || '').trim();
  const platformResolved = platformRaw ? resolvePlatformMeta(platformRaw) : null;
  const platformMeta = sourcePlatformMetaFromLabel(platformResolved?.label || platformRaw);
  const markLabel = platformResolved?.label || platformRaw || 'No platform';

  const trackings = new Set(
    rows.map((r) => (displayTrackingNumber(r) || r.tracking_number || '').trim()).filter(Boolean),
  );
  const trackingValue = trackings.size === 1 ? [...trackings][0] : '';
  const isPickup = first ? isLocalPickupFulfillment(first) : false;

  const serials = new Set(
    rows.map((r) => resolveReceivingLineSerialsCsv(r)).filter(Boolean),
  );
  const serialValue = serials.size === 1 ? [...serials][0] : '';

  const dataCell = (col: ReceivingGridColumn, rule = true) =>
    cn(receivingGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));
  const statusDot = isHistory
    ? 'bg-emerald-500'
    : getStatusDotBg(first.workflow_status, received, expected);

  const renderCell = (col: ReceivingGridColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        if (clickSelect) {
          return (
            <div
              className={cn(
                receivingGridCell({ inset: 'none', rule: true }),
                RECEIVING_GRID_FROZEN_CELL,
              )}
              style={{ left: receivingGridFrozenLeft('select') }}
              data-frozen-edge
              aria-hidden
            />
          );
        }
        return (
          <div
            className={cn(
              receivingGridCell({ inset: 'none', rule: true }),
              RECEIVING_GRID_FROZEN_CELL,
              isEmptyGutterChrome(selectGutterChrome) ? 'items-stretch p-0' : 'justify-center',
            )}
            style={{ left: receivingGridFrozenLeft('select') }}
            data-frozen-edge
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {selectMode && onToggleGroupSelect ? (
              <GridRowCheckbox
                checked={allSelected ? true : someSelected ? 'mixed' : false}
                onToggle={onToggleGroupSelect}
                label={allSelected ? 'Deselect all products in PO' : 'Select all products in PO'}
                chrome={selectGutterChrome}
              />
            ) : (
              <span className="h-4 w-4 shrink-0" aria-hidden />
            )}
          </div>
        );
      // The title column shows the title — the status dot moved to the `status`
      // track below (2026-08-02), matching the leaf rows. Scrolls with facts
      // (only `select` is frozen on this Sheets-class surface).
      case 'title':
        return (
          <div data-col="title" className={dataCell(col, rule)}>
            <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
              {title}
            </span>
          </div>
        );
      // Same state track the leaf rows render — a fold that fell through to the
      // empty default would leave a blank ruled band exactly where the summary's
      // most-scanned fact belongs.
      case 'status':
        return (
          <div data-col="status" className={dataCell(col, rule)}>
            <GridStatusCellValue
              label={workflowStageLabel(first.workflow_status)}
              toneClass={workflowStageBadge(first.workflow_status)}
              dotClass={statusDot}
            />
          </div>
        );
      // Day + time, matching the leaf cell — both halves are the same instant.
      case 'date': {
        const time = stageDisplay && stageDisplay !== '--:--' ? stageDisplay : null;
        return (
          <div data-col="date" className={dataCell(col, rule)}>
            <GridDateCellValue
              label={[dateCell?.label, time].filter(Boolean).join(' ') || undefined}
              tooltip={dateCell?.tooltip}
              className="text-role-caption"
            />
          </div>
        );
      }
      case 'qty':
        return (
          <div data-col="qty" className={dataCell(col, rule)}>
            <span
              className={cn(
                'min-w-0 truncate tabular-nums text-role-caption',
                complete ? 'text-emerald-600' : expected > 1 ? 'text-text-warning' : 'text-text-muted',
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
      case 'location': {
        const locLabel = (first.staging_location_label || '').trim();
        return (
          <div data-col="location" className={dataCell(col, rule)}>
            {locLabel ? (
              <span className="min-w-0 truncate font-mono text-role-caption tabular-nums text-text-faint">
                {locLabel}
              </span>
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      }
      case 'platform':
        return (
          <div data-col="platform" className={dataCell(col, rule)}>
            <GridPlatformMarkValue platformValue={platformMeta.value} label={markLabel} />
          </div>
        );
      // Scrollable PO track — only `select` is frozen on this Sheets-class surface.
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
            {isPickup ? (
              <FulfillmentPickupPill dense />
            ) : trackings.size > 1 ? (
              <TrackingCountChip count={trackings.size} dense />
            ) : (
              <TrackingChip
                value={trackingValue}
                showIcon={!col.omitCellIcon}
              />
            )}
          </div>
        );
      case 'serial':
        return (
          <div data-col="serial" className={dataCell(col, rule)}>
            {serials.size > 1 ? (
              <SerialCountChip count={serials.size} dense />
            ) : serialValue ? (
              <SerialChip value={serialValue} width="w-auto shrink-0" dense />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case '_fill':
        return <span data-col="_fill" className={dataCell(col, false)} aria-hidden />;
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  return (
    <div
      data-grid-summary-row=""
      className={cn(
        receivingGridRowShellClass(false, { scrollMinContent: true }),
        // Match leaf rows + column header band (h-10).
        'h-10 min-h-10 px-0',
      )}
      style={{ gridTemplateColumns: receivingGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
}
