'use client';

import { STATION_SCAN_FIELD_WELL_CLASS } from '@/components/station/scan-depth';
import { Package } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';
import { ITEM_RECORD_FACE } from './item-record-face';

/** Item thumb — `size-20` face in the title + details band. */
export function ItemRecordThumb({
  imageUrl,
  className,
  plainEmpty = false,
  iconClassName = ITEM_RECORD_FACE.packageIcon,
}: {
  imageUrl?: string | null;
  className?: string;
  /** No-photo state: just the glyph, no sunken-well fill. */
  plainEmpty?: boolean;
  /** Glyph measure for the no-photo state. */
  iconClassName?: string;
}) {
  return (
    <span
      data-item-record-thumb
      className={cn(
        'relative flex w-20 shrink-0 items-center justify-center self-stretch overflow-hidden p-0',
        ITEM_RECORD_FACE.minH,
        cornerClass('flush'),
        // Empty cube is a deeper slot on the working plate. A photo covers
        // this fill edge-to-edge (`object-cover`). `plainEmpty` keeps the
        // card's own ground and the glyph alone.
        imageUrl
          ? null
          : plainEmpty
            ? 'text-text-faint'
            : cn(STATION_SCAN_FIELD_WELL_CLASS, 'text-text-faint'),
        className,
      )}
      aria-hidden={!imageUrl}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- catalog / proxy host, not a Next-optimised asset
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <Package className={iconClassName} aria-hidden />
      )}
    </span>
  );
}
