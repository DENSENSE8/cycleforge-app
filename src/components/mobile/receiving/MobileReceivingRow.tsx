'use client';

import Link from 'next/link';
import { Camera, Image as ImageIcon } from '@/components/Icons';
import {
  conditionGradeTableLabel,
  workflowStatusTableLabel,
  getStatusDotBg,
  getWorkflowIconMeta,
  shouldShowWorkflowStatusIcon,
  type ReceivingRowDisplay,
} from '@/components/station/receiving-constants';
import { RowTitle, RowMetaColumns, META_COL } from '@/components/ui/RowMetaColumns';
import { ReceivingIdentityChips } from '@/components/receiving/ReceivingIdentityChips';
import { MobileRowPhotoActions } from '@/components/mobile/receiving/MobileRowPhotoActions';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { CaptureStackRow } from '@/design-system/components/capture-stack';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useCapabilityProviderLabel } from '@/hooks/useCapabilityProviderLabel';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { EMPTY_META_DASH, EMPTY_META_DASH_ALIGN_CLASS } from '@/lib/conditions';
import { receivingUnboxedSyncTooltip } from '@/lib/receiving/unboxed-sync-tooltip';
import { cn } from '@/utils/_cn';
import {
  resolveReceivingRowStageStamp,
  type ReceivingActivityAxis,
} from '@/components/station/receiving-lines-table-helpers';
import { RowStageTimeMeta } from '@/components/ui/RowStageTimeMeta';
import { formatDateTimePST } from '@/utils/date';

interface MobileReceivingRowProps {
  row: ReceivingLineRow;
  variant: 'collapsed' | 'expanded';
  /** True for the first ~2s after the row first appears — drives a one-time ring/glow pulse. */
  fresh?: boolean;
  onTap: () => void;
  /** Capture route — dedicated camera surface. */
  captureHref: string;
  /** Gallery route — opens swipe viewer (`?mode=gallery`). */
  galleryHref: string;
  /** Opens the carton sheet + swipe viewer in place (preferred on `/m/receiving`). */
  onOpenGallery?: () => void;
  /**
   * Shared desktop⇄mobile display flags. The mobile receiving feed is the
   * recent/history surface, so it defaults to `{ isHistory: true }` — which
   * suppresses the workflow status icon exactly like the desktop history table.
   */
  display?: ReceivingRowDisplay;
  /** History axis — defaults to Unbox (`unboxed`) to match desktop history default. */
  activityAxis?: ReceivingActivityAxis;
}

/**
 * Mobile receiving row — the phone mirror of a {@link ReceivingLinesTable} row.
 * Uses the SAME primitives so the two can't drift: {@link RowTitle} (status dot
 * + product title), {@link RowMetaColumns} (qty · condition · stage clock),
 * and {@link ReceivingIdentityChips} (PO / SKU / tracking / serial, always
 * rendered as fixed columns — empties read as '--------'). The bottom-pinned
 * expanded card adds capture CTA; collapsed rows show gallery + camera buttons on
 * the right (gallery left, capture right).
 */
export function MobileReceivingRow({
  row,
  variant,
  fresh = false,
  onTap,
  captureHref,
  galleryHref,
  onOpenGallery,
  display = { isHistory: true },
  activityAxis = 'unboxed',
}: MobileReceivingRowProps) {
  const { label: inventoryProviderLabel } = useCapabilityProviderLabel('inventory');
  const productTitle = row.item_name || row.zoho_item_id || 'Unnamed inbound line';
  const quantityText = `${row.quantity_received}/${row.quantity_expected ?? '?'}`;
  const qtyExpected = row.quantity_expected ?? 0;
  const workflowLabel = workflowStatusTableLabel(row.workflow_status || 'EXPECTED');
  const statusDotTip =
    receivingUnboxedSyncTooltip({
      workflowStatus: row.workflow_status,
      inventoryProviderLabel,
    }) ?? workflowLabel;
  // Icon mapping + show/hide are the SAME shared decision the desktop table uses.
  const { Icon: WorkflowIcon, tone: workflowIconTone } = getWorkflowIconMeta(workflowLabel);
  const showWorkflowIcon = shouldShowWorkflowStatusIcon(display);
  const stageStamp = resolveReceivingRowStageStamp(row, activityAxis);
  const stageTooltip = stageStamp
    ? [
        stageStamp.staffName
          ? `${stageStamp.label} ${formatDateTimePST(stageStamp.instant)} by ${stageStamp.staffName}`
          : `${stageStamp.label} ${formatDateTimePST(stageStamp.instant)}`,
      ].join(' · ')
    : null;

  const condGrade = (row.condition_grade || '').toUpperCase();
  const conditionLabel = conditionGradeTableLabel(row.condition_grade);

  const poValue = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').toString().trim();
  const trackingValue = (row.tracking_number || '').trim();
  const skuValue = (row.sku || '').trim();
  const photoCount = row.photo_count ?? 0;
  const isExpanded = variant === 'expanded';

  return (
    <CaptureStackRow variant={variant} fresh={fresh} onTap={onTap} dataAttr={{ name: 'line-row-id', value: row.id }}>
      {/* Title — identical primitive to the desktop table row. */}
      <RowTitle
        dot={getStatusDotBg(row.workflow_status, row.quantity_received, row.quantity_expected)}
        dotTitle={statusDotTip}
        dotTrack={META_COL.dotTrackWide}
        title={productTitle}
      />

      {/* Second row: qty · condition (left) + chips + photo actions (right). */}
      <div className="pointer-events-auto mt-0.5 flex min-w-0 max-w-full items-center gap-1 overflow-hidden">
        <RowMetaColumns
          className="!mt-0 shrink-0"
          indent={META_COL.indentWide}
          qtyCol={META_COL.qtyColWide}
          // Same PARTS / L-New grades as desktop ReceivingLineOrderRow.
          condCol={META_COL.poCondCol}
          qty={
            <span
              className={
                qtyExpected > 1
                  ? 'text-text-warning'
                  : row.quantity_expected && row.quantity_received >= row.quantity_expected
                    ? 'text-emerald-600'
                    : 'text-text-muted'
              }
            >
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
            <span className="inline-flex items-center gap-1.5">
              <RowStageTimeMeta
                instant={stageStamp?.instant}
                label={stageStamp?.label ?? 'Scanned'}
                tooltip={stageStamp ? stageTooltip : undefined}
                reserve
              />
              {showWorkflowIcon ? (
                <HoverTooltip label={workflowLabel} asChild>
                  <span className="inline-flex items-center">
                    <WorkflowIcon className={`h-3.5 w-3.5 ${workflowIconTone}`} />
                  </span>
                </HoverTooltip>
              ) : null}
            </span>
          }
        />
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden">
          <div className="min-w-0 overflow-hidden">
            {/* Serial chip omitted — one comma-joined value for every unit on
                the carton is unreadable on a phone row (same call as the unbox
                feed + carton sheet). */}
            <ReceivingIdentityChips row={row} po={poValue} sku={skuValue} tracking={trackingValue} includeSerial={false} asColumns dense />
          </div>
          {!isExpanded ? (
            <MobileRowPhotoActions
              photoCount={photoCount}
              galleryHref={galleryHref}
              captureHref={captureHref}
              onOpenGallery={onOpenGallery}
              className="shrink-0"
            />
          ) : null}
        </div>
      </div>

      {/* Bottom bar: fixed-width gallery + wide camera, same height. */}
      {isExpanded && (
        <div className="pointer-events-auto mt-3 flex h-14 gap-2">
          {onOpenGallery ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onOpenGallery();
              }}
              aria-label={photoCount > 0 ? `View ${photoCount} photos` : 'Open photo gallery'}
              className={
                photoCount > 0
                  ? 'ds-raw-button inline-flex h-full w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-none border border-border-soft bg-surface-sunken text-text-default active:bg-surface-sunken'
                  : 'ds-raw-button inline-flex h-full w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-none border border-border-soft bg-surface-canvas text-text-faint active:bg-surface-sunken'
              }
            >
              <ImageIcon className="h-5 w-5" />
              {photoCount > 0 ? (
                <span className="text-role-micro leading-none tabular-nums">x{photoCount}</span>
              ) : null}
            </button>
          ) : (
            <Link
              href={galleryHref}
              prefetch={false}
              aria-label={photoCount > 0 ? `View ${photoCount} photos` : 'Open photo gallery'}
              className={
                photoCount > 0
                  ? 'inline-flex h-full w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-none border border-border-soft bg-surface-sunken text-text-default active:bg-surface-sunken'
                  : 'inline-flex h-full w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-none border border-border-soft bg-surface-canvas text-text-faint active:bg-surface-sunken'
              }
            >
              <ImageIcon className="h-5 w-5" />
              {photoCount > 0 ? (
                <span className="text-role-micro leading-none tabular-nums">x{photoCount}</span>
              ) : null}
            </Link>
          )}
          <Link
            href={captureHref}
            prefetch={false}
            aria-label={`Take photos${photoCount > 0 ? ` (${photoCount} so far)` : ''}`}
            className="inline-flex h-full min-w-0 flex-1 items-center justify-center rounded-none bg-blue-600 text-white shadow-[0_6px_14px_-6px_rgba(37,99,235,0.55)] transition-transform active:scale-[0.98] active:bg-blue-700"
          >
            <Camera className="h-6 w-6" />
          </Link>
        </div>
      )}
    </CaptureStackRow>
  );
}
