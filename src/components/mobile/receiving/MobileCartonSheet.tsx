'use client';

import Link from 'next/link';
import { Camera } from '@/components/Icons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useCapabilityProviderLabel } from '@/hooks/useCapabilityProviderLabel';
import { MobileReceivingPhotoStrip } from '@/components/mobile/receiving/MobileReceivingPhotoStrip';
import { OrderIdChip, TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import {
  joinStackedIdentityKeys,
  StackedRowIdentity,
} from '@/components/ui/StackedRowIdentity';
import {
  conditionGradeTableLabel,
  getStatusDotBg,
  workflowStatusTableLabel,
} from '@/components/station/receiving-constants';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { EMPTY_META_DASH, EMPTY_META_DASH_ALIGN_CLASS } from '@/lib/conditions';
import { receivingUnboxedSyncTooltip } from '@/lib/receiving/unboxed-sync-tooltip';
import { cn } from '@/utils/_cn';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { receivingLinePhotoHrefs } from '@/lib/photos/mobile-gallery-url';

interface MobileCartonSheetProps {
  row: ReceivingLineRow | null;
  staffId: number;
  open: boolean;
  onClose: () => void;
}

/**
 * Phone-tuned sheet for a single receiving line. Mobile is photo-only — no
 * editor fields, no form. Header mirrors {@link MobileReceivingRow}: title +
 * qty • condition on the left (workflow icon suppressed on history/unbox feed),
 * copy chips stacked on the right. {@link MobileReceivingPhotoStrip} shows all
 * captured thumbs; tapping opens the shared swipe viewer.
 * The CTA hands off to the dedicated camera route at /m/r/{id}/photos.
 */
export function MobileCartonSheet({ row, staffId, open, onClose }: MobileCartonSheetProps) {
  const { label: inventoryProviderLabel } = useCapabilityProviderLabel('inventory');

  if (!row) return null;

  const receivingId = row.receiving_id;
  const productTitle = row.item_name || row.zoho_item_id || 'Unnamed inbound line';
  const poValue = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
  const trackingValue = (row.tracking_number || '').trim();
  const qtyExpected = row.quantity_expected ?? 0;
  const qtyReceived = row.quantity_received;
  const photoCount = row.photo_count ?? 0;
  const quantityText = `${qtyReceived}/${row.quantity_expected ?? '?'}`;
  const workflowLabel = workflowStatusTableLabel(row.workflow_status || 'EXPECTED');
  const statusDotTip =
    receivingUnboxedSyncTooltip({
      workflowStatus: row.workflow_status,
      inventoryProviderLabel,
    }) ?? workflowLabel;
  const conditionLabel = conditionGradeTableLabel(row.condition_grade);
  const condGrade = (row.condition_grade || '').toUpperCase();

  const { captureHref: photosHref, galleryHref } = receivingLinePhotoHrefs({
    receivingId,
    lineId: row.id,
    itemName: row.item_name,
    sku: row.sku,
    zohoItemId: row.zoho_item_id,
    poRef: poValue || undefined,
    back: '/m/receiving',
  });

  return (
    <BottomSheet open={open} onClose={onClose} maxWidth="32rem">
      <div className="flex flex-col gap-4">
        {/* Header — StackedRowIdentity: title → qty/condition · PO · tracking. */}
        <div className="flex items-start gap-2">
          <HoverTooltip label={statusDotTip} asChild>
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${getStatusDotBg(row.workflow_status, qtyReceived, row.quantity_expected)}`}
            />
          </HoverTooltip>
          <StackedRowIdentity
            className="min-w-0 flex-1"
            title={
              <div className="line-clamp-2 text-sm font-semibold text-text-default">
                {productTitle}
              </div>
            }
            keys={joinStackedIdentityKeys([
              <span
                key="qty-cond"
                className="flex shrink-0 items-center gap-1 text-role-caption font-semibold uppercase tracking-widest"
              >
                <span
                  className={
                    qtyExpected > 1 && qtyReceived < qtyExpected
                      ? 'text-text-warning'
                      : row.quantity_expected && qtyReceived >= row.quantity_expected
                        ? 'text-emerald-600'
                        : 'text-text-muted'
                  }
                >
                  {quantityText}
                </span>
                <span className="text-text-faint">•</span>
                <span
                  className={cn(
                    conditionGradeTextClass(condGrade),
                    conditionLabel === EMPTY_META_DASH && EMPTY_META_DASH_ALIGN_CLASS,
                  )}
                >
                  {conditionLabel}
                </span>
              </span>,
              <OrderIdChip key="po" value={poValue} display={getLast8(poValue)} dense />,
              <TrackingChip
                key="tracking"
                value={trackingValue}
                display={getLast8(trackingValue)}
                dense
              />,
            ])}
          />
        </div>

        {/* Existing photos */}
        {receivingId && galleryHref !== '#' ? (
          <MobileReceivingPhotoStrip
            receivingId={receivingId}
            staffId={staffId}
            galleryHref={galleryHref}
            countHint={photoCount}
            onNavigate={onClose}
          />
        ) : receivingId ? null : (
          <p className="rounded-none bg-amber-50 px-4 py-3 text-center text-role-caption font-semibold text-amber-700">
            No package id yet — scan tracking from desktop first.
          </p>
        )}

        {/* Primary CTA — hands off to dedicated capture surface */}
        {photosHref !== '#' ? (
          <Link
            href={photosHref}
            prefetch={false}
            onClick={onClose}
            aria-label={`Take photos (${photoCount} so far)`}
            className="flex h-14 w-full items-center justify-center rounded-none bg-blue-600 text-white shadow-sm transition-colors active:bg-blue-700"
          >
            <Camera className="h-6 w-6" />
          </Link>
        ) : null}
      </div>
    </BottomSheet>
  );
}
