'use client';

/**
 * Reference row for "what is in this box" — Zoho product thumb + title + meta.
 *
 * ## SoT
 *
 * Read/reference hosts compose this atom:
 * - Carton-read `ContentsList` on `/carton/[id]`
 * - Parked Unbox `UnboxItemsPanel` on `unbox-work` (not mounted on main)
 *
 * Work surfaces (Triage / Testing accordion) keep {@link PoLineRow} — never
 * lobotomize that chrome for read (pattern-evolution D6).
 *
 * Image URLs come from {@link RECEIVING_LINE_IMAGE_URL_SQL} (Zoho document-id
 * proxy). Hosts own one `usePhotoGallery` + `PhotoViewerPortal` and pass
 * `onOpenImage`. Optional `onOpenDetails` mounts the top-right ⋮ (Unbox →
 * ReceivingDetailsStack on RightRailHost).
 */

import type { ReactNode } from 'react';
import { MoreHorizontal, Package } from '@/components/Icons';
import {
  ConditionGradeChip,
  EmptySkuChipFace,
  SerialChip,
  SkuScanRefChip,
  UnitPriceChip,
  getLast8,
} from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

type ReceivingLineContentsRowProps = {
  title: string;
  imageUrl: string | null;
  sku: string;
  conditionGrade: string | null | undefined;
  serials: string[];
  /** Unbox: UnitPriceChip. Carton: omit. */
  unitPrice?: number | string | null;
  /** Qty before SKU — Unbox: single contents number; Carton: ProgressBadge. */
  qtySlot?: ReactNode;
  titleMode: 'truncate' | 'wrap';
  /** Opens the host gallery at this row's image. */
  onOpenImage?: () => void;
  /** When set, renders top-right MoreHorizontal (Unbox → details overlay). */
  onOpenDetails?: () => void;
  className?: string;
};

function hasPositivePrice(unitPrice: number | string | null | undefined): boolean {
  if (unitPrice == null || unitPrice === '') return false;
  const n = Number(unitPrice);
  return Number.isFinite(n) && n > 0;
}

export function ReceivingLineContentsRow({
  title,
  imageUrl,
  sku,
  conditionGrade,
  serials,
  unitPrice,
  qtySlot,
  titleMode,
  onOpenImage,
  onOpenDetails,
  className,
}: ReceivingLineContentsRowProps) {
  const skuTrim = sku.trim();
  const showPrice = hasPositivePrice(unitPrice);

  const thumbInner = imageUrl ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- tenant photo host, not a Next-optimised asset */}
      <img
        src={imageUrl}
        alt=""
        className="absolute inset-0 size-full object-cover"
        loading="lazy"
      />
    </>
  ) : (
    <Package className="h-7 w-7" aria-hidden />
  );

  const thumbClass = cn(
    'relative size-20 shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-border-soft',
    imageUrl
      ? 'bg-surface-strong'
      : 'flex items-center justify-center bg-surface-strong text-text-faint',
  );

  return (
    <div className={cn('flex min-w-0 items-stretch gap-2.5', className)}>
      {imageUrl && onOpenImage ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenImage();
          }}
          aria-label={`View photo of ${title}`}
          className={cn(
            // Thumbnail control — Button chrome fights the 80px product tile.
            'ds-raw-button',
            thumbClass,
            focusRing('control', 'accent'),
          )}
        >
          {thumbInner}
        </button>
      ) : (
        <span className={thumbClass}>{thumbInner}</span>
      )}

      <div className="flex min-h-20 min-w-0 flex-1 flex-col justify-between gap-1 py-0.5">
        <div className="flex min-w-0 items-start gap-1">
          <span
            className={cn(
              'min-w-0 flex-1 text-sm font-semibold leading-tight text-text-default',
              titleMode === 'truncate' ? 'truncate' : 'break-words',
            )}
          >
            {title}
          </span>
          {onOpenDetails ? (
            <HoverTooltip label="More details" asChild>
              <IconButton
                ariaLabel="More details"
                size="xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetails();
                }}
                className="-mr-1 -mt-0.5 shrink-0"
                icon={
                  <MoreHorizontal
                    className="h-3.5 w-3.5 text-text-faint"
                    aria-hidden
                  />
                }
              />
            </HoverTooltip>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap items-baseline gap-1">
          {qtySlot ? <span className="shrink-0">{qtySlot}</span> : null}
          {skuTrim ? (
            <SkuScanRefChip value={skuTrim} display={getLast8(skuTrim)} />
          ) : (
            <EmptySkuChipFace dense={false} />
          )}
          <ConditionGradeChip grade={conditionGrade} />
          {serials.map((sn) => (
            <SerialChip key={sn} value={sn} width="w-fit max-w-full" />
          ))}
          {showPrice ? (
            <span className="ml-auto shrink-0">
              <UnitPriceChip amount={unitPrice as number | string} />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
