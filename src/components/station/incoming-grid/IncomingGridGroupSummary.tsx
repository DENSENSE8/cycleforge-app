'use client';

import { Fragment, type ReactNode } from 'react';
import { Check } from '@/components/Icons';
import {
  conditionGradeTableLabel,
  getStatusDotBg,
} from '@/components/station/receiving-constants';
import { IncomingAttachTrackingButton } from '@/components/station/IncomingAttachTrackingButton';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import {
  OrderIdChip,
  TrackingChip,
  TrackingCountChip,
  getLast4,
} from '@/components/ui/CopyChip';
import { usePlatformMeta } from '@/hooks/useCatalog';
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
import {
  GridAgeCellValue,
  GridCellDash,
  GridDateCellValue,
  GridPlatformMarkValue,
} from '@/components/ui/grid-cells';
import { cn } from '@/utils/_cn';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { ReceivingPoSummary } from '@/components/station/ReceivingPoSummary';
import { IncomingGridStatusCell } from './IncomingGridStatusCell';

/**
 * Collapsed multi-line PO header for Incoming LedgerGrid — same column tracks
 * as {@link IncomingGridRow}. Mobile falls back to {@link ReceivingPoSummary}.
 */
export function IncomingGridGroupSummary({
  rows,
  isMobile,
  columns = INCOMING_GRID_COLUMNS,
  selectMode = false,
  allSelected = false,
  someSelected = false,
  onToggleGroupSelect,
}: {
  rows: ReceivingLineRow[];
  isMobile: boolean;
  columns?: readonly IncomingGridColumn[];
  selectMode?: boolean;
  allSelected?: boolean;
  someSelected?: boolean;
  onToggleGroupSelect?: () => void;
}) {
  const resolvePlatformMeta = usePlatformMeta();

  if (isMobile) {
    return <ReceivingPoSummary rows={rows} isMobile isIncoming />;
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

  const groupDateKey = rows.reduce<string | null>((best, r) => {
    const src = incomingRowDateSource(r);
    if (!src) return best;
    const key = toPSTDateKey(src);
    if (!key || key === 'Unknown') return best;
    return best == null || key < best ? key : best;
  }, null);
  const dateCell = groupDateKey
    ? {
        label: formatDateKeyShort(groupDateKey),
        tooltip: formatDateKeyMedium(groupDateKey, { weekday: 'short', withYear: true }),
      }
    : null;
  const groupDateSource = groupDateKey;
  const daysLate = getDaysLateNullable(groupDateSource);
  const laneAgeLabel = formatLaneAgeCompact(groupDateSource);
  const laneAgeHours = getLaneAgeHours(groupDateSource);
  const showLaneAge = Boolean(laneAgeLabel) && daysLate === null;
  const ageTooltip =
    daysLate !== null
      ? `${daysLate} day${daysLate === 1 ? '' : 's'} past expected`
      : laneAgeLabel
        ? `Age ${laneAgeLabel}`
        : '';
  const ageNode = (
    <GridAgeCellValue
      daysLate={daysLate}
      laneAgeLabel={showLaneAge ? laneAgeLabel : null}
      laneAgeHours={laneAgeHours}
      tooltip={ageTooltip}
      className="text-role-caption"
    />
  );

  const platformRaw = (first.source_platform || first.inbound_source_type || '').trim();
  const platformResolved = platformRaw ? resolvePlatformMeta(platformRaw) : null;
  const platformMeta = sourcePlatformMetaFromLabel(platformResolved?.label || platformRaw);
  const markLabel = platformResolved?.label || platformRaw || 'No platform';

  const trackings = new Set(
    rows.map((r) => (displayTrackingNumber(r) || r.tracking_number || '').trim()).filter(Boolean),
  );
  const trackingValue = trackings.size === 1 ? [...trackings][0] : '';
  const isPickup = first ? isLocalPickupFulfillment(first) : false;
  const deliveryState = first?.delivery_state;
  const trackingAction =
    deliveryState === 'AWAITING_TRACKING' && (first.zoho_purchaseorder_id || '').trim()
      ? (
          <IncomingAttachTrackingButton
            poId={(first.zoho_purchaseorder_id || '').trim()}
            poNumber={first.zoho_purchaseorder_number}
          />
        )
      : undefined;

  const dataCell = (rule = true) => incomingGridCell({ rule, inset: 'grid' });

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
              e.stopPropagation();
            }}
          >
            {selectMode ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleGroupSelect?.();
                }}
                aria-label={allSelected ? 'Deselect all products in PO' : 'Select all products in PO'}
                aria-checked={allSelected ? true : someSelected ? 'mixed' : false}
                role="checkbox"
                className={cn(
                  'ds-raw-button flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                  allSelected
                    ? 'border-accent-bg bg-accent-bg text-text-inverse'
                    : someSelected
                      ? 'border-accent-bg bg-accent-bg/20 text-accent-bg'
                      : 'border-border-default bg-surface-card hover:border-border-strong',
                )}
              >
                {allSelected ? (
                  <Check className="h-3 w-3" />
                ) : someSelected ? (
                  <span className="h-0.5 w-2 rounded-full bg-current" />
                ) : null}
              </button>
            ) : (
              <span className="h-4 w-4 shrink-0" aria-hidden />
            )}
          </div>
        );
      case 'title':
        return (
          <div
            data-col="title"
            className={cn(dataCell(rule), INCOMING_GRID_FROZEN_CELL, 'gap-1.5')}
            style={{ left: incomingGridFrozenLeft('title') }}
            data-frozen-edge
          >
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                getStatusDotBg(first.workflow_status, received, expected),
              )}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
              {title}
            </span>
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
        return (
          <div data-col="qty" className={cn(dataCell(rule), 'justify-end')}>
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
        return (
          <div data-col="status" className={cn(dataCell(rule), 'gap-1')}>
            <IncomingGridStatusCell row={first} />
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
            {isPickup ? (
              <FulfillmentPickupPill dense />
            ) : trackings.size > 1 ? (
              <TrackingCountChip count={trackings.size} dense />
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
      data-grid-summary-row=""
      className={cn(incomingGridRowShellClass(false, { scrollMinContent: true }), 'px-0')}
      style={{ gridTemplateColumns: incomingGridTemplate(columns) }}
    >
      {columns.map((col, i) => (
        <Fragment key={col.key}>{renderCell(col, i === columns.length - 1)}</Fragment>
      ))}
    </div>
  );
}
