'use client';

import { useEffect, useMemo, useState } from 'react';
import { MobileSwipePhotoViewer, type SwipePhotoSlide } from '@/components/mobile/station/MobileSwipePhotoViewer';
import { cornerClass } from '@/design-system/tokens/radius';
import { deletePhoto } from '@/lib/photos/delete-photo-client';
import { photoContentUrl } from '@/lib/photos/display-url';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const TILE_CLASS = cn(
  'relative block shrink-0 overflow-hidden border border-mode-rule bg-mode-well focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
  cornerClass('control'),
);

/**
 * Evidence: a SKU's photos as a preview (one hero tile plus two smaller tiles,
 * the last reads `+N` when there are more) or, in the host sheet's gallery
 * stage, a grid of every photo. Tiles open the phone's full-screen swipe viewer
 * (`+N` opens the gallery when the host offers one); neither face carries a
 * destructive control. Deletion exists only inside the viewer, behind its armed
 * second press, and only when `deletable` (on-hold stock owns its evidence).
 */
export function SkuLinkedPhotoStrip({
  photoIds,
  deletable = false,
  onDeleted,
  onViewerOpenChange,
  layout = 'preview',
  onViewAll,
}: {
  /** SKU_STOCK photo ids in display order (`[0]` = cover), read with the record. */
  photoIds: readonly number[];
  deletable?: boolean;
  onDeleted?: (photoId: number) => void;
  /** A host modal (Radix sheet) must not treat viewer presses as outside presses. */
  onViewerOpenChange?: (open: boolean) => void;
  /** `preview` = hero + two tiles (`+N`); `grid` = every photo, the in-sheet gallery. */
  layout?: 'preview' | 'grid';
  /** The preview's `+N` tile opens the gallery stage of the host sheet instead of the viewer. */
  onViewAll?: () => void;
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const slides = useMemo<SwipePhotoSlide[]>(
    () => photoIds.map((id) => ({ id: String(id), previewUrl: photoContentUrl(id), deletable })),
    [deletable, photoIds],
  );
  const viewerOpen = viewerIndex != null;
  useEffect(() => {
    onViewerOpenChange?.(viewerOpen);
  }, [onViewerOpenChange, viewerOpen]);

  if (photoIds.length === 0) return null;
  const grid = layout === 'grid';
  const extra = grid ? 0 : photoIds.length - 3;
  const opensAll = (index: number) => index === 2 && extra > 0 && onViewAll != null;
  const tile = (index: number, className: string) => (
    // ds-raw-button: an image tile, not a Button shape.
    <button
      key={photoIds[index]}
      type="button"
      onClick={() => (opensAll(index) ? onViewAll?.() : setViewerIndex(index))}
      aria-label={index === 2 && extra > 0 ? `View all ${photoIds.length} photos` : `View photo ${index + 1} of ${photoIds.length}`}
      className={cn(TILE_CLASS, className)}
      data-testid={index === 0 ? 'sku-photo-hero' : index === 2 && extra > 0 ? 'sku-photo-all' : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated photo endpoint */}
      <img
        src={photoContentUrl(photoIds[index]!, 'thumb')}
        alt=""
        loading={index === 0 ? 'eager' : 'lazy'}
        decoding="async"
        className="h-full w-full object-cover"
      />
      {index === 2 && extra > 0 ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold tabular-nums text-white">
          +{extra}
        </span>
      ) : null}
    </button>
  );

  return (
    <section
      aria-label={`${photoIds.length} photo${photoIds.length === 1 ? '' : 's'}`}
      className={grid ? 'grid grid-cols-3 gap-1' : 'flex gap-1'}
      data-testid={grid ? 'sku-photo-grid' : 'sku-photo-preview'}
    >
      {grid ? (
        photoIds.map((_, index) => tile(index, 'aspect-square w-full'))
      ) : (
        <>
          {tile(0, 'size-24')}
          {photoIds.length > 1 ? (
            <div className="flex flex-col gap-1">
              {tile(1, 'size-[2.875rem]')}
              {photoIds.length > 2 ? tile(2, 'size-[2.875rem]') : null}
            </div>
          ) : null}
        </>
      )}
      <MobileSwipePhotoViewer
        slides={slides}
        open={viewerOpen}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
        onDelete={deletable ? async (slide) => {
          const photoId = Number(slide.id);
          try {
            await deletePhoto(photoId, slide.previewUrl);
            onDeleted?.(photoId);
            toast.success('Photo deleted');
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'Could not delete the photo');
          }
        } : undefined}
      />
    </section>
  );
}
