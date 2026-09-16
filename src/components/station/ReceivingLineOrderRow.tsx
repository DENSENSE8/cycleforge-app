'use client';

/**
 * A single receiving line rendered as a dashboard-style order row. Built from
 * the shared RowTitle / RowMetaColumns / ReceivingIdentityChips primitives so it
 * lines up with the collapsed PO summary. History Unbox/Triage meta clocks use
 * the same `formatOpsStageTime` + `MetaFactSlot` language as OrdersQueue.
 */

import { Check } from '@/components/Icons';
import {
  conditionGradeTableLabel,
  workflowStatusTableLabel,
  getStatusDotBg,
  getWorkflowIconMeta,
  shouldShowWorkflowStatusIcon,
} from '@/lib/receiving/receiving-constants';
import { ReceivingIdentityChips } from '@/components/receiving/ReceivingIdentityChips';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import {
  RowTitle,
  RowMetaColumns,
  META_COL,
  QUEUE_ROW,
  metaIndentFor,
} from '@/components/ui/RowMetaColumns';
import {
  IncomingTrackingStatusCluster,
} from '@/components/station/ReceivingDeliveryStateIcon';
import { IconWithTooltip } from '@/components/ui/IconWithTooltip';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { EMPTY_META_DASH, EMPTY_META_DASH_ALIGN_CLASS } from '@/lib/conditions';
import { cn } from '@/utils/_cn';
import {
  dashboardOrderRowChipsClass,
  dashboardOrderRowShellClass,
} from '@/lib/dashboard-order-row-layout';
import {
  resolveReceivingRowStageStamp,
  type ReceivingActivityAxis,
} from '@/components/station/receiving-lines-table-helpers';
import { IncomingAttachTrackingButton } from '@/components/station/IncomingAttachTrackingButton';
import { RowStageTimeMeta } from '@/components/ui/RowStageTimeMeta';
import { formatDateTimePST } from '@/utils/date';
import { usePlatformMeta } from '@/hooks/useCatalog';
import {
  getReceivingPoIdentityParts,
  receivingProductTitle,
} from '@/lib/receiving/po-group-title';
import {
  getReceivingStatusDot,
  getReceivingStatusDotLabel,
} from '@/lib/receiving/rail/status';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { resolveReceivingLineSerialsCsv } from './receiving-line-serials';

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

export function ReceivingLineOrderRow({
  row,
  isSelected,
  onSelect,
  index,
  isMobile,
  isIncoming = false,
  isHistory = false,
  statusVocabulary = 'fine',
  selectMode = false,
  isChecked,
  onToggleSelect,
  /** History day-band axis — Unbox → `unboxed`, Triage → `scanned`. */
  activityAxis = 'scanned',
}: {
  row: ReceivingLineRow;
  isSelected: boolean;
  onSelect: () => void;
  index: number;
  isMobile: boolean;
  /** Incoming view: serials aren't assigned until unboxing and the carrier /
   *  "EXPECTED" status are redundant, so we drop those chips/labels. */
  isIncoming?: boolean;
  /** History view: workflow status icon is noise (received is implied on
   *  Unbox History; Testing History still paints fine status via the dot). */
  isHistory?: boolean;
  /**
   * Unbox / Receiving History → `'coarse'` (Scanned / Unboxed / Received).
   * Testing History stays `'fine'` so FAILED dots remain visible.
   */
  statusVocabulary?: 'fine' | 'coarse';
  /** Multi-select mode: render the leading checkbox. */
  selectMode?: boolean;
  /**
   * Bulk membership, when the surface splits the two planes (`onToggleSelect`).
   * Defaults to `isSelected` for the legacy surfaces where one flag still means
   * both "checked" and "open".
   */
  isChecked?: boolean;
  /**
   * Gutter checkbox handler. When given, the checkbox becomes a REAL control
   * (bulk membership) and the row tap is left to `onSelect` — the record plane.
   * Omitted → the historical painted span, where the row tap toggles instead.
   */
  onToggleSelect?: () => void;
  activityAxis?: ReceivingActivityAxis;
}) {
  const stageStamp = !isIncoming ? resolveReceivingRowStageStamp(row, activityAxis) : null;
  const resolvePlatformMeta = usePlatformMeta();
  // Unfound cartons (no Zoho PO) arrive labelled "Unfound PO" from the server
  // (buildUnmatchedEmptyReceivingLine / UNMATCHED_EMPTY_LINE_LABEL).
  const productTitle = receivingProductTitle(row);
  const quantityText = `${row.quantity_received}/${row.quantity_expected ?? '?'}`;
  const qtyExpected = row.quantity_expected ?? 0;
  const workflowLabel = workflowStatusTableLabel(row.workflow_status || 'EXPECTED');
  const coarseDot =
    statusVocabulary === 'coarse' ? getReceivingStatusDot(row) : null;
  const coarseLabel =
    statusVocabulary === 'coarse' ? getReceivingStatusDotLabel(row) : null;
  // The workflow status renders as a compact icon (not text) — RECEIVED and
  // EXPECTED are the dominant states; everything else falls back to a generic
  // package glyph. The label rides along as the `title` for hover/a11y.
  const { Icon: WorkflowIcon, tone: workflowIconTone } = getWorkflowIconMeta(workflowLabel);
  const condGrade = (row.condition_grade || '').toUpperCase();
  const conditionLabel = conditionGradeTableLabel(row.condition_grade);
  const trackingValue = (row.tracking_number || '').trim();
  const skuValue = (row.sku || '').trim();
  // Marketplace purchases without a Zoho PO fall back to source_order_id (eBay order #).
  const { poValue } = getReceivingPoIdentityParts(row, (raw) => resolvePlatformMeta(raw).label);
  // Join all serials so SerialChip's CSV-aware helper picks the most recent and
  // shows its last 6 chars. Return-intake fallback rows retain their scanned
  // identity in the generated title until the serial projection catches up.
  const serialsCsv = resolveReceivingLineSerialsCsv(row);
  // One flag on the legacy surfaces (checked === open); split where the caller
  // passes the two planes separately.
  const checked = isChecked ?? isSelected;

  return (
    <div
      data-line-row-id={row.id}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      // Once the gutter owns its own toggle, the ROW body is purely the record
      // plane — a whole-width `role="checkbox"` would be claiming a gesture it
      // no longer performs.
      role={selectMode && !onToggleSelect ? 'checkbox' : 'button'}
      tabIndex={0}
      aria-checked={selectMode && !onToggleSelect ? checked : undefined}
      aria-pressed={selectMode && !onToggleSelect ? undefined : isSelected}
      aria-label={
        onToggleSelect
          ? `Open receiving line ${row.id}`
          : `Select receiving line ${row.id}`
      }
      className={cn(
        dashboardOrderRowShellClass(isMobile),
        'border-b border-border-hairline transition-colors cursor-pointer hover:bg-blue-50/50',
        QUEUE_ROW.px,
        'py-1.5',
        isSelected
          ? QUEUE_ROW.selectedClass
          : index % 2 === 1
            ? 'bg-surface-canvas/40'
            : 'bg-surface-card',
      )}
    >
      <div className="flex min-w-0 flex-col">
        <RowTitle
          leading={
            !selectMode ? undefined : onToggleSelect ? (
              <GridRowCheckbox
                checked={checked}
                onToggle={onToggleSelect}
                label={`Select receiving line ${row.id} for bulk actions`}
              />
            ) : (
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  checked ? 'border-accent-bg bg-accent-bg text-text-inverse' : 'border-border-default bg-surface-card'
                }`}
              >
                {checked && <Check className="h-3 w-3" />}
              </span>
            )
          }
          // Coarse History: Scanned / Unboxed / Received (testing terminals →
          // Received). Fine (Testing History): workflow-stage dots incl. FAILED.
          dot={
            coarseDot
            ?? getStatusDotBg(
              row.workflow_status,
              row.quantity_received,
              row.quantity_expected,
            )
          }
          dotTitle={coarseLabel ?? workflowLabel}
          dotTrack={META_COL.dotTrackWide}
          title={productTitle}
        />
        <RowMetaColumns
          indent={metaIndentFor('wide', selectMode)}
          qtyCol={META_COL.qtyColWide}
          // Receiving grades include NEW / L-NEW / PARTS — wider than orders'
          // single-letter A/B so the rest cluster (stage clock) stays column-aligned.
          condCol={META_COL.poCondCol}
          qty={
            <span className={qtyExpected > 1 ? 'text-text-warning' : row.quantity_expected && row.quantity_received >= row.quantity_expected ? 'text-emerald-600' : 'text-text-muted'}>
              {quantityText}
            </span>
          }
          condition={
            <span
              className={cn(
                conditionGradeTextClass(condGrade),
                conditionLabel === EMPTY_META_DASH && EMPTY_META_DASH_ALIGN_CLASS,
              )}
            >
              {conditionLabel}
            </span>
          }
          rest={
            <div className="flex items-center gap-2">
              {/* Axis-matched stage clock (OrdersQueue MetaFactSlot language).
                  Unbox tab → unboxed_at (scan fallback); Triage → scanned_at.
                  Always reserve the track so Unfound / pending rows stay aligned. */}
              <span className="hidden sm:contents">
                <RowStageTimeMeta
                  instant={stageStamp?.instant}
                  label={stageStamp?.label ?? 'Scanned'}
                  tooltip={
                    stageStamp
                      ? receivingStageTooltip(row, stageStamp, activityAxis)
                      : undefined
                  }
                  reserve
                />
              </span>
              {/* Workflow status icon: shown in the active receive workspace,
                  hidden in History (received is implied; EXPECTED doesn't apply
                  since unfound is still received) and in Incoming. This also
                  drops the testing verdict (FAILED box) from the unbox history. */}
              {shouldShowWorkflowStatusIcon({ isHistory, isIncoming }) ? (
                <IconWithTooltip
                  Icon={WorkflowIcon}
                  label={workflowLabel}
                  iconClassName={workflowIconTone}
                />
              ) : null}
              <IncomingTrackingStatusCluster
                deliveryState={row.delivery_state}
                sellerReported={isIncoming && row.tracking_confidence === 'seller_reported'}
                labelClassName="min-w-0 truncate text-role-eyebrow font-semibold text-amber-700"
                showCarrierCity={
                  isIncoming && row.tracking_confidence === 'carrier_confirmed'
                }
                carrierEvent={
                  isIncoming && row.tracking_confidence === 'carrier_confirmed'
                    ? {
                        city: row.shipment_latest_event_city,
                        postal: row.shipment_latest_event_postal,
                        eventAt: row.shipment_latest_event_at,
                        lastCheckedAt: row.shipment_last_checked_at,
                      }
                    : null
                }
              />
            </div>
          }
        />
      </div>

      <ReceivingIdentityChips
        row={row}
        po={poValue}
        sku={skuValue}
        tracking={trackingValue}
        serialsCsv={serialsCsv}
        includeSerial={!isIncoming}
        asColumns={!isMobile}
        className={dashboardOrderRowChipsClass(isMobile)}
        // Incoming AWAITING_TRACKING: the empty tracking chip becomes the
        // "Add tracking" trigger, pre-targeted to this PO.
        trackingAction={
          isIncoming && row.delivery_state === 'AWAITING_TRACKING' && (row.zoho_purchaseorder_id || '').trim()
            ? (
              <IncomingAttachTrackingButton
                poId={(row.zoho_purchaseorder_id || '').trim()}
                poNumber={row.zoho_purchaseorder_number}
              />
            )
            : undefined
        }
      />
    </div>
  );
}
