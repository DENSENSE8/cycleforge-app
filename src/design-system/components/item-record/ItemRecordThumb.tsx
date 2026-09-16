'use client';

import { STATION_SCAN_FIELD_WELL_CLASS } from '@/components/station/scan-depth';
import { Package } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';
import { ITEM_RECORD_FACE } from './item-record-face';

/**
 * Item thumb — `size-20` face in the title + details band. Stretches with the
 * row so a wrapping title still fills the left rail.
 *
 * `plainEmpty` drops the sunken-well fill on the no-photo state, leaving just
 * the gray Package glyph on the card's own ground. The well reads as an
 * input slot on scan-station plates, where the thumb sits inside a chrome
 * well; on a white card (the qty strip, triage rows) it reads as a gray box
 * fighting the card, and the glyph alone says "no photo" more quietly.
 */
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
  /**
   * Glyph measure for the no-photo state. Defaults to the desk face's 40px
   * square; a surface that shrinks the cube must shrink the glyph with it, or
   * the placeholder fills the box (`ITEM_RECORD_MOBILE_THUMB.packageIcon` is
   * the phone's 24px answer).
   */
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
