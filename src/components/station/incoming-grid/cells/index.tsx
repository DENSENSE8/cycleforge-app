'use client';

/**
 * Incoming LedgerGrid cell registry — one switch, edit the matching case.
 * Row shell builds {@link IncomingGridCellCtx}; domain values stay here.
 */

import type { ReactNode } from 'react';
import { FulfillmentPickupPill } from '@/components/receiving/ReceivingIdentityChips';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { OrderIdChip, getLast8 } from '@/components/ui/CopyChip';
import { TrackingNumberMenuChip } from '@/components/ui/TrackingNumberMenuChip';
import {
  GridAgeCellValue,
  GridCellDash,
  GridDateCellValue,
  GridPlatformMarkValue,
  GridQtyFractionValue,
} from '@/components/ui/grid-cells';
import {
  GridClickSelectFace,
  GridRowCheckbox,
  isEmptyGutterChrome,
  type GridSelectGutterChrome,
} from '@/components/ui/GridRowCheckbox';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ZohoReceiptChip } from '@/components/station/receiving-grid/cells/ReceivingZohoCell';
import { IncomingGridStatusCell } from '@/components/station/incoming-grid/IncomingGridStatusCell';
import { gridCellAlignClass } from '@/design-system/components/grid';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { isEmptyMetaDash } from '@/lib/conditions';
import {
  INCOMING_GRID_FROZEN_CELL,
  incomingGridCell,
  incomingGridFrozenLeft,
  type IncomingGridColumn,
} from '@/lib/receiving/incoming-grid-layout';
import {
  INCOMING_REMOVAL_REASON_FACE,
  type IncomingRemovalReason,
} from '@/lib/receiving/incoming-removal-reason';
import type { SourcePlatformMeta } from '@/lib/source-platform';
import {
  formatDateKeyMedium,
  formatDateKeyShort,
  toPSTDateKey,
} from '@/utils/date';
import { cn } from '@/utils/_cn';

export function incomingDateCell(source: string | null | undefined): {
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

export function displayProductTitle(row: ReceivingLineRow): string {
  return (
    row.catalog_product_title ||
    row.zoho_item_title ||
    row.item_name ||
    row.zoho_item_id ||
    'Unnamed inbound line'
  );
}

export interface IncomingGridCellCtx {
  row: ReceivingLineRow;
  productTitle: string;
  condGrade: string;
  conditionLabel: string;
  dateCell: { label: string; tooltip: string } | null;
  daysLate: number | null;
  laneAgeLabel: string | null;
  laneAgeHours: number | null;
  ageTooltip: string;
  platformMeta: SourcePlatformMeta;
  markLabel: string;
  poValue: string;
  isPickup: boolean;
  pickupLabel: string | null;
  trackingValue: string;
  trackingAction: ReactNode;
  /** Opens the Incoming inspector for Edit on a filled tracking chip. */
  onEditTracking?: () => void;
  removalFace: (typeof INCOMING_REMOVAL_REASON_FACE)[IncomingRemovalReason] | null;
  selectMode: boolean;
  isChecked: boolean;
  /** Undefined when clickSelect — row body owns bulk toggle. */
  onToggle?: () => void;
  selectGutterChrome?: GridSelectGutterChrome;
  clickSelect?: boolean;
}

function dataCell(col: IncomingGridColumn, rule = true) {
  return cn(incomingGridCell({ rule, inset: 'grid' }), gridCellAlignClass(col));
}

export function renderIncomingGridCell(
  col: IncomingGridColumn,
  rule: boolean,
  ctx: IncomingGridCellCtx,
): ReactNode {
  const {
    row,
    productTitle,
    condGrade,
    conditionLabel,
    dateCell,
    daysLate,
    laneAgeLabel,
    laneAgeHours,
    ageTooltip,
    platformMeta,
    markLabel,
    poValue,
    isPickup,
    pickupLabel,
    trackingValue,
    trackingAction,
    onEditTracking,
    removalFace,
    selectMode,
    isChecked,
    onToggle,
    selectGutterChrome = 'always',
    clickSelect = false,
  } = ctx;

  switch (col.key) {
    case 'select': {
      // Click-select: the row body owns bulk toggle; gutter paints membership
      // so header select-all still aligns on the select track.
      if (clickSelect) {
        return (
          <div
            className={cn(
              incomingGridCell({ inset: 'none', rule: true }),
              INCOMING_GRID_FROZEN_CELL,
              'relative overflow-hidden p-0',
            )}
            style={{ left: incomingGridFrozenLeft('select') }}
            data-frozen-edge
            aria-hidden
          >
            <GridClickSelectFace
              checked={isChecked}
              className="absolute inset-0"
            />
          </div>
        );
      }
      const emptyGutter = isEmptyGutterChrome(selectGutterChrome);
      return (
        <div
          className={cn(
            incomingGridCell({ inset: 'none', rule: true }),
            INCOMING_GRID_FROZEN_CELL,
            emptyGutter ? 'items-stretch p-0' : 'justify-center',
          )}
          style={{ left: incomingGridFrozenLeft('select') }}
          data-frozen-edge
        >
          {selectMode && onToggle ? (
            <GridRowCheckbox
              checked={isChecked}
              onToggle={onToggle}
              label={`Select receiving line ${row.id} for bulk actions`}
              chrome={selectGutterChrome}
            />
          ) : (
            <span className="h-4 w-4 shrink-0" aria-hidden />
          )}
        </div>
      );
    }
    case 'title':
      // Identity column — collection-map read-only
      // (`isGridColumnInCellEditable` / GRID_IDENTITY_COLUMN_KEYS). Clicks
      // fall through to the row (open record); title correction is rematch /
      // catalog at the record plane, not an in-cell caret.
      //
      // **The title column shows the title** (2026-08-02). The workflow dot
      // that used to lead it is gone: Incoming's own `status` track is the
      // CARRIER delivery state, and the two things the workflow dot actually
      // distinguished here are already said by columns of their own — in
      // transit vs delivered by the `status` delivery icon, and
      // quantity-complete by `qty` (`received/expected`). What was left was a
      // second vocabulary for the same facts, spending the title's truncation
      // budget on every row.
      // Scrolls with facts (only `select` is frozen — Unbox Sheets golden).
      return (
        <div data-col="title" className={dataCell(col, rule)}>
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
          <GridAgeCellValue
            daysLate={daysLate}
            laneAgeLabel={laneAgeLabel}
            laneAgeHours={laneAgeHours}
            tooltip={ageTooltip}
            className="text-role-caption"
          />
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
          {isEmptyMetaDash(conditionLabel) ? (
            <GridCellDash />
          ) : (
            <span
              className={cn(
                'min-w-0 truncate text-role-eyebrow uppercase',
                conditionGradeTextClass(condGrade),
              )}
            >
              {conditionLabel}
            </span>
          )}
        </div>
      );
    case 'status':
      return (
        <div data-col="status" className={cn(dataCell(col, rule), 'min-w-0 gap-1')}>
          <IncomingGridStatusCell row={row} />
        </div>
      );
    case 'platform':
      return (
        <div data-col="platform" className={dataCell(col, rule)}>
          <GridPlatformMarkValue
            platformValue={platformMeta.value}
            label={markLabel}
            meta={platformMeta}
          />
        </div>
      );
    // Scrolls with facts (only `select` is frozen — Unbox Sheets golden).
    case 'order':
      return (
        <div data-col="order" className={dataCell(col, rule)}>
          <OrderIdChip
            value={poValue}
            display={getLast8(poValue)}
            platformLabel={platformMeta.value ? platformMeta.label : null}
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
          ) : trackingValue ? (
            <TrackingNumberMenuChip
              value={trackingValue}
              carrierHint={row.carrier}
              showIcon={!col.omitCellIcon}
              onEdit={onEditTracking}
            />
          ) : null}
        </div>
      );
    // Why this row left Incoming. Resolved through the shared registry, which
    // the bulk-paste residual report also reads — one ladder, two surfaces, so
    // the lane and the panel can never name different reasons for one carton.
    case 'removed':
      return (
        <div data-col="removed" className={dataCell(col, rule)}>
          {removalFace ? (
            <HoverTooltip label={removalFace.tip} focusable={false}>
              <span
                className={cn(
                  'inset-chip rounded text-role-micro uppercase tracking-widest ring-1 ring-inset',
                  removalFace.className,
                )}
              >
                {removalFace.label}
              </span>
            </HoverTooltip>
          ) : (
            <GridCellDash />
          )}
        </div>
      );
    // Vendor receipt state — the SAME face the Unbox/History family renders,
    // so a chip cannot mean two things on two inbound grids.
    case 'zoho':
      return (
        <div data-col="zoho" className={dataCell(col, rule)}>
          <ZohoReceiptChip
            status={row.zoho_status}
            syncedAt={row.zoho_status_synced_at}
          />
        </div>
      );
    default:
      return <span className={dataCell(col, rule)} />;
  }
}
