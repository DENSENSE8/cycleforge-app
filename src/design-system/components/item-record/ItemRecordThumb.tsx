'use client';

import { Package } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';
import { ITEM_RECORD_FACE } from './item-record-face';

/**
 * Item thumb — `size-20` face in the title + details band. Stretches with the
 * row so a wrapping title still fills the left rail.
 */
export function ItemRecordThumb({
  imageUrl,
  className,
}: {
  imageUrl?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'relative flex w-20 shrink-0 items-center justify-center self-stretch overflow-hidden border-r border-border-soft p-0',
        ITEM_RECORD_FACE.minH,
        cornerClass('flush'),
        'bg-surface-card',
        imageUrl ? null : 'text-text-faint',
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
        <Package className={ITEM_RECORD_FACE.packageIcon} aria-hidden />
      )}
    </span>
  );
}
