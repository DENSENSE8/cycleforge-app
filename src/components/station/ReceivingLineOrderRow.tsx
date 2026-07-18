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
} from '@/components/station/receiving-constants';
import { ReceivingIdentityChips } from '@/components/receiving/ReceivingIdentityChips';
import { RowTitle, RowMetaColumns, META_COL, META_REST_COL, MetaFactSlot } from '@/components/ui/RowMetaColumns';
import { DeliveryStateIcon } from '@/components/station/ReceivingDeliveryStateIcon';
import { IconWithTooltip } from '@/components/ui/IconWithTooltip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
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
import { formatDateTimePST, formatOpsStageTime } from '@/utils/date';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import type { ReceivingLineRow } from './receiving-line-row';
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
  selectMode = false,
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
  /** History view: everything shown has already been received (an unfound box
   *  is received too — it just can't be marked received in Zoho because the PO
   *  isn't found there). So the workflow status icon (EXPECTED clock / RECEIVED
   *  check) and the testing verdict (FAILED box) are noise — we drop the icon
   *  and read the dot as a uniform "received" green. */
  isHistory?: boolean;
  /** Multi-select mode: render a checkbox and treat `isSelected` as "checked".
   *  Click toggles membership instead of opening the workspace. */
  selectMode?: boolean;
  activityAxis?: ReceivingActivityAxis;
}) {
  // Re-render when the operator flips 12h↔24h so wall-clock stamps track the preference.
  useTimeFormat();
  const stageStamp = !isIncoming ? resolveReceivingRowStageStamp(row, activityAxis) : null;
  const stageTimeDisplay = stageStamp ? formatOpsStageTime(stageStamp.instant) : null;
  const hasStageTime = Boolean(stageTimeDisplay && stageTimeDisplay !== '--:--');
  // Unfound cartons (no Zoho PO) arrive labelled "Unfound PO" from the server
  // (buildUnmatchedEmptyReceivingLine / UNMATCHED_EMPTY_LINE_LABEL).
  const productTitle = row.item_name || row.zoho_item_id || 'Unnamed inbound line';
  const quantityText = `${row.quantity_received}/${row.quantity_expected ?? '?'}`;
  const qtyExpected = row.quantity_expected ?? 0;
  const workflowLabel = workflowStatusTableLabel(row.workflow_status || 'EXPECTED');
  // The workflow status renders as a compact icon (not text) — RECEIVED and
  // EXPECTED are the dominant states; everything else falls back to a generic
  // package glyph. The label rides along as the `title` for hover/a11y.
  const { Icon: WorkflowIcon, tone: workflowIconTone } = getWorkflowIconMeta(workflowLabel);
  const condGrade = (row.condition_grade || '').toUpperCase();
  const conditionLabel = conditionGradeTableLabel(row.condition_grade);
  const trackingValue = (row.tracking_number || '').trim();
  const skuValue = (row.sku || '').trim();
  const poValue = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
  // Join all serials so SerialChip's CSV-aware helper picks the most recent and
  // shows its last 6 chars. Return-intake fallback rows retain their scanned
  // identity in the generated title until the serial projection catches up.
  const serialsCsv = resolveReceivingLineSerialsCsv(row);

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
      role={selectMode ? 'checkbox' : 'button'}
      tabIndex={0}
      aria-checked={selectMode ? isSelected : undefined}
      aria-pressed={selectMode ? undefined : isSelected}
      aria-label={`Select receiving line ${row.id}`}
      className={`${dashboardOrderRowShellClass(isMobile)} border-b border-border-hairline px-3 py-1.5 transition-colors cursor-pointer hover:bg-blue-50/50 ${
        isSelected ? 'bg-blue-50/80' : index % 2 === 1 ? 'bg-surface-canvas/40' : 'bg-surface-card'
      }`}
    >
      <div className="flex min-w-0 flex-col">
        <RowTitle
          leading={
            selectMode ? (
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-border-default bg-surface-card'
                }`}
              >
                {isSelected && <Check className="h-3 w-3" />}
              </span>
            ) : undefined
          }
          // History reads as received across the board (unfound boxes included),
          // so the dot is a uniform "received" green there rather than the
          // workflow-derived color that paints unfound rows amber/"pending".
          dot={isHistory ? 'bg-emerald-500' : getStatusDotBg(row.workflow_status, row.quantity_received, row.quantity_expected)}
          dotTitle={isHistory ? 'Received' : workflowLabel}
          dotTrack={META_COL.dotTrackWide}
          title={productTitle}
        />
        <RowMetaColumns
          // In select mode the title row gains a leading checkbox (w-4 + mr-2 =
          // 1.5rem), shifting the title text right. Add that same offset to the
          // meta indent so the qty · condition · rest subrow stays aligned under
          // the title instead of stranding at the original (un-shifted) x.
          indent={selectMode ? `calc(${META_COL.indentWide} + 1.5rem)` : META_COL.indentWide}
          qtyCol={META_COL.qtyColWide}
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
                  Unbox tab → unboxed_at; Triage → scanned_at. Absolute + staff
                  live in the tooltip. Hidden on mobile — history is desktop. */}
              {hasStageTime && stageStamp ? (
                <span className="hidden sm:contents">
                  <MetaFactSlot width={META_REST_COL.stageTime} className="text-text-faint" reserve={false}>
                    <HoverTooltip
                      label={receivingStageTooltip(row, stageStamp, activityAxis)}
                      asChild
                      focusable={false}
                    >
                      <span className="truncate tabular-nums">{stageTimeDisplay}</span>
                    </HoverTooltip>
                  </MetaFactSlot>
                </span>
              ) : null}
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
              <DeliveryStateIcon state={row.delivery_state} />
              {isIncoming && row.tracking_confidence === 'seller_reported' ? (
                <HoverTooltip label="Seller reported tracking — carrier has not confirmed yet">
                  <span className="text-role-eyebrow font-semibold text-amber-700">Seller</span>
                </HoverTooltip>
              ) : null}
              {isIncoming && row.tracking_confidence === 'carrier_confirmed' && row.shipment_latest_event_city ? (
                <HoverTooltip
                  label={`Last carrier event${row.shipment_latest_event_at ? ` · ${row.shipment_latest_event_at}` : ''}${row.shipment_last_checked_at ? ` · synced ${row.shipment_last_checked_at}` : ''}`}
                >
                  <span className="hidden text-role-eyebrow font-semibold text-text-faint sm:inline">
                    {row.shipment_latest_event_city}
                    {row.shipment_latest_event_postal ? ` ${row.shipment_latest_event_postal}` : ''}
                  </span>
                </HoverTooltip>
              ) : null}
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
