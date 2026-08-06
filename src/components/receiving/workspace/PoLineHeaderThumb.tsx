'use client';

import { Package } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';
import { PO_LINE_HEADER_FACE } from '@/components/receiving/workspace/station-scan-face';

/**
 * PO line header product thumb — `size-20` face in the title + details band.
 * Stretches with the row so a wrapping title still fills the left rail.
 */
export function PoLineHeaderThumb({
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
        PO_LINE_HEADER_FACE.minH,
        cornerClass('flush'),
        imageUrl ? 'bg-surface-card' : 'bg-surface-card text-text-faint',
        className,
      )}
      aria-hidden={!imageUrl}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Zoho proxy / catalog host, not a Next-optimised asset
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <Package className={PO_LINE_HEADER_FACE.packageIcon} aria-hidden />
      )}
    </span>
  );
}
