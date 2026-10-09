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
  fit = 'contain',
}: {
  imageUrl?: string | null;
  className?: string;
  /** No-photo state: just the glyph, no sunken-well fill. */
  plainEmpty?: boolean;
  /** Glyph measure for the no-photo state. */
  iconClassName?: string;
  /**
   * `contain` keeps the photo's full frame; `cover` fills the slot and crops
   * around the centre (a portrait shot in a row shows its middle).
   */
  fit?: 'contain' | 'cover';
}) {
  return (
    <span
      data-item-record-thumb
      className={cn(
        'relative flex w-20 shrink-0 items-center justify-center self-stretch overflow-hidden p-0',
        ITEM_RECORD_FACE.minH,
        cornerClass('flush'),
        // Empty cube is a deeper slot on the working plate. A photo preserves
        // its full frame (`object-contain`). `plainEmpty` keeps the
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
          className={cn('absolute inset-0 size-full', fit === 'cover' ? 'object-cover object-center' : 'object-contain')}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <Package className={iconClassName} aria-hidden />
      )}
    </span>
  );
}
