'use client';

import { useRouter } from 'next/navigation';
import { Camera } from '@/components/Icons';
import { RowTitle, RowMetaColumns, META_COL, RowConditionMeta } from '@/components/ui/RowMetaColumns';
import { ReceivingIdentityChips } from '@/components/receiving/ReceivingIdentityChips';
import type { PackerLogRow } from '@/components/mobile/packer/types';
import { CaptureStackRow } from '@/design-system/components/capture-stack';
import { orderRowQtyTone } from '@/lib/condition-tone';
import { RowStageTimeMeta } from '@/components/ui/RowStageTimeMeta';
import { OutcomeChip } from '@/features/review/OutcomeChip';
import { PACK_SLIP_PHOTO_TYPE, PACK_BOX_PHOTO_TYPE } from '@/lib/photos/types';
import { Button } from '@/design-system/primitives';
import { formatSalePrice } from '@/lib/dashboard/orders-queue-helpers';

interface MobilePackingRowProps {
  row: PackerLogRow;
  variant: 'collapsed' | 'expanded';
  fresh?: boolean;
  onTap: () => void;
  photosHref: string;
}

function getSourceDotBg(row: PackerLogRow): string {
  const trackingType = String(row.tracking_type || '').toUpperCase();
  if (trackingType === 'FNSKU' || row.fnsku) return 'bg-fill-info';
  if (trackingType === 'SKU') return 'bg-fill-warning';
  if (trackingType === 'ORDERS') return 'bg-fill-info';
  return 'bg-fill-success';
}

/** Mobile packing row — the same display as {@link MobileReceivingRow}: */
export function MobilePackingRow({ row, variant, fresh = false, onTap, photosHref }: MobilePackingRowProps) {
  const router = useRouter();
  const productTitle = row.product_title || row.item_number || row.sku || 'Unnamed pack line';
  const quantity = parseInt(String(row.quantity || '1'), 10) || 1;
  const orderId = (row.order_id || '').trim();
  const trackingValue = (row.shipping_tracking_number || row.scan_ref || '').trim();
  const photos = Array.isArray(row.packer_photos_url) ? row.packer_photos_url : [];
  const photoCount = photos.length;
  const hasSlip = photos.some((p) => p.photoType === PACK_SLIP_PHOTO_TYPE);
  const hasBox = photos.some((p) => p.photoType === PACK_BOX_PHOTO_TYPE);
  const outcome = (row.verification_outcome || '').trim() || null;
  const isExpanded = variant === 'expanded';
  const packedAt = (row.created_at || '').trim() || null;
  const price = formatSalePrice(row.sale_amount, row.currency);

  return (
    <CaptureStackRow variant={variant} fresh={fresh} onTap={onTap} dataAttr={{ name: 'packer-row-id', value: row.id }}>
      <RowTitle dot={getSourceDotBg(row)} dotTrack={META_COL.dotTrackWide} title={productTitle} />

      <div className="pointer-events-auto mt-0.5 flex items-center gap-2">
        <RowMetaColumns
          className="!mt-0 shrink-0"
          indent={META_COL.indentWide}
          qtyCol={META_COL.qtyColWide}
          qty={<span className={orderRowQtyTone(quantity)}>{quantity}</span>}
          condition={<RowConditionMeta condition={row.condition} />}
          rest={
            packedAt ? (
              <span className="flex items-center gap-2">
                {price ? <span data-testid="mobile-packing-row-price" className="font-mono text-role-caption font-semibold tabular-nums text-text-success">{price}</span> : null}
                <RowStageTimeMeta
                  instant={packedAt}
                  label="Packed"
                  tooltipExtra={row.packed_by_name ? `by ${row.packed_by_name}` : null}
                />
              </span>
            ) : price ? <span data-testid="mobile-packing-row-price" className="font-mono text-role-caption font-semibold tabular-nums text-text-success">{price}</span> : undefined
          }
        />
        <div className="ml-auto min-w-0">
          <ReceivingIdentityChips po={orderId} tracking={trackingValue} includeSku={false} includeSerial={false} asColumns dense />
        </div>
      </div>

      {(hasSlip || hasBox || outcome || (!isExpanded && photoCount > 0)) && (
        <div className="pointer-events-none mt-1 flex flex-wrap items-center gap-1.5 pl-[calc(0.5rem+0.5rem)]">
          {hasSlip ? (
            <span className="rounded-none bg-surface-sunken px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
              Slip
            </span>
          ) : null}
          {hasBox ? (
            <span className="rounded-none bg-surface-sunken px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
              Box
            </span>
          ) : null}
          {outcome ? <OutcomeChip outcome={outcome} /> : null}
          {!isExpanded && !hasSlip && !hasBox && photoCount > 0 ? (
            <span className="rounded-none bg-surface-sunken px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft tabular-nums">
              ×{photoCount}
            </span>
          ) : null}
        </div>
      )}

      {isExpanded && (
        <Button
          type="button"
          variant="primary"
          size="lg"
          radius="flush"
          onClick={() => router.replace(photosHref)}
          ariaLabel="Take photos"
          className="pointer-events-auto mt-3 h-12 w-full text-role-caption uppercase tracking-[0.18em]"
        >
          <Camera className="h-5 w-5" />
          {photoCount > 0 ? (
            <span className="tabular-nums lowercase text-text-inverse">x{photoCount}</span>
          ) : null}
        </Button>
      )}
    </CaptureStackRow>
  );
}
