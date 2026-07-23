'use client';

import { Fragment, memo, useCallback, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Check } from '@/components/Icons';
import {
  conditionGradeTableLabel,
  getStatusDotBg,
} from '@/components/station/receiving-constants';
import { IncomingAttachTrackingButton } from '@/components/station/IncomingAttachTrackingButton';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import { OrderIdChip, TrackingChip, getLast4 } from '@/components/ui/CopyChip';
import { useIsColumnHidden } from '@/components/ui/table-column-config/TableColumnConfig';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { LedgerCellEditor } from '@/design-system/components/grid';
import { focusRing } from '@/design-system/tokens/focus-ring';
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
import { toast } from '@/lib/toast';
import {
  formatDateKeyMedium,
  formatDateKeyShort,
  formatLaneAgeCompact,
  getDaysLateNullable,
  getLaneAgeHours,
  toPSTDateKey,
} from '@/utils/date';
import {
  GridAgeCellValue,
  GridCellDash,
  GridDateCellValue,
  GridPlatformMarkValue,
} from '@/components/ui/grid-cells';
import { cn } from '@/utils/_cn';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { ReceivingLineOrderRow } from '@/components/station/ReceivingLineOrderRow';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
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
  const isHidden = useIsColumnHidden();
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
      // Optimistic: bump every cascade field so the cell shows the edit immediately
      // (list payloads prefer catalog_product_title over item_name).
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
          const catRes = await fetch(`/api/sku-catalog/${catalogId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productTitle: trimmed }),
          });
          // Catalog manage may be gated — line item_name already persisted.
          if (!catRes.ok) {
            // Keep optimistic catalog title so the grid doesn't snap back.
          }
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

  const dataCell = (rule = true) => incomingGridCell({ rule, inset: 'grid' });

  const ageNode = (
    <GridAgeCellValue
      daysLate={daysLate}
      laneAgeLabel={showLaneAge ? laneAgeLabel : null}
      laneAgeHours={laneAgeHours}
      tooltip={ageTooltip}
      className="text-role-caption"
    />
  );

  // Pending Sheets contract (OrdersQueueTableRow): in-cell editing stays armed
  // regardless of selectMode — checkbox gutter toggles selection; title click
  // edits. Mobile keeps the legacy stack (display-only).
  const gridEditable = !isMobile;

  // Pending navigate-mode cell trigger — click → edit (stopPropagation so the
  // row doesn't open); Enter/F2 → edit in place; printable → replace content.
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
        return (
          <div
            data-col="title"
            className={cn(
              dataCell(rule),
              INCOMING_GRID_FROZEN_CELL,
              // `relative` required for LedgerCellEditor absolute overlay (Pending
              // date/qty cells; title sticky alone is not enough under nest folds).
              'relative gap-1.5',
              gridEditable && focusRing('cell'),
            )}
            style={{ left: incomingGridFrozenLeft('title') }}
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
      case 'age':
        return (
          <div data-col="age" className={dataCell(rule)}>
            {ageNode}
          </div>
        );
      case 'qty':
        return isHidden('qty') ? (
          <span className={dataCell(rule)} />
        ) : (
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
        return isHidden('condition') ? (
          <span className={dataCell(rule)} />
        ) : (
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
      case 'status':
        return isHidden('rest') ? (
          <span className={dataCell(rule)} />
        ) : (
          <div data-col="status" className={cn(dataCell(rule), 'gap-1')}>
            <IncomingGridStatusCell row={row} />
          </div>
        );
      case 'platform':
        return isHidden('platform') ? (
          <span className={dataCell(rule)} />
        ) : (
          <div data-col="platform" className={dataCell(rule)}>
            <GridPlatformMarkValue platformValue={platformMeta.value} label={markLabel} />
          </div>
        );
      case 'order':
        return isHidden('orderid') ? (
          <span className={dataCell(rule)} />
        ) : (
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
        return isHidden('tracking') ? (
          <span className={dataCell(rule)} />
        ) : (
          <div data-col="tracking" className={dataCell(rule)}>
            {isPickup && pickupLabel ? (
              <FulfillmentPickupPill dense />
            ) : trackingValue ? (
              <TrackingChip value={trackingValue} display={getLast4(trackingValue)} />
            ) : (
              trackingAction ?? <GridCellDash />
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
        incomingGridRowShellClass(false, { scrollMinContent: true }),
        'cursor-pointer border-b border-border-hairline px-0 py-0 transition-colors hover:bg-surface-hover',
        isSelected
          ? QUEUE_ROW.selectedClass
          : index % 2 === 1
            ? 'bg-surface-canvas'
            : 'bg-surface-card',
      )}
      style={{ gridTemplateColumns: incomingGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
});
