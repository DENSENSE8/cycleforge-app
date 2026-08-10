'use client';

import { Image as ImageIcon } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * Loading skeleton — a grid of placeholder tiles at the small-grid rhythm.
 *
 * Static, not a shimmer (2026-08-09). Reserving the real geometry is the part
 * an operator reads; 24 tiles breathing in unison is the part that reads as the
 * page failing to settle. Same call as `PhotoThumb`'s per-tile placeholder.
 */
export function PhotoGridSkeleton() {
  return (
    <div
      className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-8"
      aria-busy="true"
      aria-label="Loading photos"
    >
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          className={cn('aspect-square animate-pulse bg-surface-sunken', cornerClass('flush'))}
        />
      ))}
    </div>
  );
}

/** Teaching empty state — explains the filter, doesn't just say "nothing here". */
export function PhotoEmptyState() {
  return (
    <div
      className={cn(
        'mx-auto mt-6 flex max-w-sm flex-col items-center gap-2 border border-dashed border-border-soft bg-surface-canvas inset-empty text-center',
        cornerClass('flush'),
      )}
    >
      <ImageIcon className="h-6 w-6 text-text-faint" />
      <p className="text-sm font-semibold text-text-default">No photos in this view</p>
      <p className="text-xs leading-relaxed text-text-soft">
        Unboxing, packing, and claim photos land here as staff capture them. Widen the
        date range or media type in the header to see more.
      </p>
    </div>
  );
}
