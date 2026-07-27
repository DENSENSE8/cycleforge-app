'use client';

import { Fragment, memo, useCallback, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Check } from '@/components/Icons';
import {
  conditionGradeTableLabel,
  getStatusDotBg,
} from '@/components/station/receiving-constants';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import { OrderIdChip, SerialChip, TrackingChip, getLast4 } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  GridCellDash,
  GridDateCellValue,
  GridPlatformMarkValue,
} from '@/components/ui/grid-cells';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { LedgerCellEditor } from '@/design-system/components/grid';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { EMPTY_META_DASH, EMPTY_META_DASH_ALIGN_CLASS } from '@/lib/conditions';
import {
  displayTrackingNumber,
  fulfillmentModeLabel,
  isLocalPickupFulfillment,
} from '@/lib/receiving/fulfillment-mode';
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
import { toast } from '@/lib/toast';
import { formatDateTimePST, formatOpsStageTime } from '@/utils/date';
import { cn } from '@/utils/_cn';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { ReceivingLineOrderRow } from '@/components/station/ReceivingLineOrderRow';
import {
  dispatchLineUpdated,
  resolveReceivingRowStageStamp,
  type ReceivingActivityAxis,
} from '@/components/station/receiving-lines-table-helpers';
import { resolveReceivingLineSerialsCsv } from '@/components/station/receiving-line-serials';
import { getReceivingPoIdentityParts } from '@/lib/receiving/po-group-title';
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
  const [editingTitle, setEditingTitle] = useState(false);
  const [editSeed, setEditSeed] = useState<string | null>(null);

  const closeTitleEditor = useCallback(() => {
    setEditingTitle(false);
    setEditSeed(null);
  }, []);

  const openTitleEditor = useCallback((seed: string | null = null) => {
    setEditSeed(seed);
    setEditingTitle(true);
  }, []);

  const commitTitle = useCallback(
    async (next: string) => {
      const trimmed = next.trim();
      if (!trimmed) return;
      const catalogId = row.sku_catalog_id;
      dispatchLineUpdated({
        id: row.id,
        item_name: trimmed,
        catalog_product_title: trimmed,
        zoho_item_title: trimmed,
      });

      try {
        const lineRes = await fetch('/api/receiving-lines', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.id, item_name: trimmed }),
        });
        const lineData = await lineRes.json().catch(() => null);
        if (!lineRes.ok || !lineData?.success) {
          throw new Error(lineData?.error || 'Failed to update title');
        }

        if (catalogId != null && Number.isFinite(catalogId) && catalogId > 0) {
          await fetch(`/api/sku-catalog/${catalogId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productTitle: trimmed }),
          });
        }

        toast.success('Title updated');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to update title');
      }
    },
    [row.id, row.sku_catalog_id],
  );

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

  const dataCell = (rule = true) => receivingGridCell({ rule, inset: 'grid' });
  const gridEditable = !isMobile;

  const titleTriggerProps = gridEditable
    ? {
        tabIndex: 0 as const,
        'aria-label': `Edit title — ${productTitle}`,
        onClick: (e: MouseEvent) => {
          e.stopPropagation();
          openTitleEditor();
        },
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === 'F2') {
            e.preventDefault();
            e.stopPropagation();
            openTitleEditor();
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            openTitleEditor(e.key);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).blur();
          }
        },
      }
    : {};

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
        return (
          <div
            data-col="title"
            className={cn(
              dataCell(rule),
              RECEIVING_GRID_FROZEN_CELL,
              'relative gap-1.5',
              gridEditable && focusRing('cell'),
            )}
            style={{ left: receivingGridFrozenLeft('title') }}
            data-frozen-edge
            {...titleTriggerProps}
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDot)} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
              {productTitle}
            </span>
            {editingTitle && gridEditable ? (
              <LedgerCellEditor
                initialValue={productTitle === 'Unnamed inbound line' ? '' : productTitle}
                replaceWith={editSeed}
                ariaLabel="Edit product title"
                onCommit={(next) => {
                  void commitTitle(next);
                }}
                onClose={closeTitleEditor}
              />
            ) : null}
          </div>
        );
      case 'date':
        return (
          <div data-col="date" className={dataCell(rule)}>
            <GridDateCellValue
              label={dateCell?.label}
              tooltip={dateCell?.tooltip}
              className="text-role-caption"
            />
          </div>
        );
      case 'qty':
        return (
          <div data-col="qty" className={cn(dataCell(rule), 'justify-end')}>
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
          <div data-col="condition" className={dataCell(rule)}>
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
          <div data-col="stage" className={dataCell(rule)}>
            {stageDisplay && stageDisplay !== '--:--' ? (
              <HoverTooltip label={stageTip} focusable={false}>
                <span className="truncate tabular-nums text-role-caption text-text-faint">
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
          <div data-col="platform" className={dataCell(rule)}>
            <GridPlatformMarkValue platformValue={platformMeta.value} label={markLabel} />
          </div>
        );
      case 'order':
        return (
          <div data-col="order" className={dataCell(rule)}>
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
          <div data-col="tracking" className={dataCell(rule)}>
            {isPickup && pickupLabel ? (
              <FulfillmentPickupPill dense />
            ) : trackingValue ? (
              <TrackingChip value={trackingValue} display={getLast4(trackingValue)} />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      case 'serial':
        return (
          <div data-col="serial" className={dataCell(rule)}>
            {serialsCsv ? (
              <SerialChip value={serialsCsv} width="w-auto shrink-0" dense />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      default:
        return <span className={dataCell(rule)} />;
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
        if (editingTitle) return;
        onSelect();
      }}
      onKeyDown={(event) => {
        if (editingTitle) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        receivingGridRowShellClass(false, { scrollMinContent: true }),
        'cursor-pointer border-b border-border-hairline px-0 py-0 transition-colors hover:bg-surface-hover',
        isSelected
          ? QUEUE_ROW.selectedClass
          : index % 2 === 1
            ? 'bg-surface-canvas'
            : 'bg-surface-card',
      )}
      style={{ gridTemplateColumns: receivingGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
