'use client';

import type { MouseEvent } from 'react';
import Link from 'next/link';
import { Camera, Image as ImageIcon } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

interface MobileRowPhotoActionsProps {
  photoCount: number;
  galleryHref: string;
  captureHref: string;
  className?: string;
  /** When set and photos exist, opens the in-sheet swipe viewer instead of navigating away. */
  onOpenGallery?: () => void;
}

const BTN = cn(
  'inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-0.5 rounded-xl px-2 transition-colors active:scale-[0.97]',
  focusRing('control'),
);

/** Fixed to icon + two tabular digits so 1 and 11 do not resize the chip. */
const GALLERY_BTN = cn(
  BTN,
  'w-12 border-0 bg-blue-50 text-blue-700 hover:bg-blue-100 active:bg-blue-100',
);

/** Always occupies two digit columns (`1` and `11` are the same width). */
export function GalleryPhotoCount({
  count,
  className,
  prefix,
}: {
  count: number;
  className?: string;
  prefix?: string;
}) {
  const n = Math.max(0, count);
  return (
    <span className={cn('inline-flex items-baseline justify-center tabular-nums', className)}>
      {prefix}
      <span className="inline-block w-[2ch] text-center font-semibold">{n}</span>
    </span>
  );
}

/**
 * Collapsed-row photo affordances: gallery (left) and capture (right).
 * Newest expanded cards keep their own bottom bar. `pointer-events-auto` +
 * click stopPropagation so row tap doesn't open the sheet.
 */
export function MobileRowPhotoActions({
  photoCount,
  galleryHref,
  captureHref,
  className,
  onOpenGallery,
}: MobileRowPhotoActionsProps) {
  const safeCount = Math.max(0, photoCount);
  const hasPhotos = safeCount > 0;
  const disabled = captureHref === '#' && galleryHref === '#';

  if (disabled) return null;

  const stop = (e: MouseEvent) => e.stopPropagation();

  const openGallery = (e: MouseEvent) => {
    stop(e);
    e.preventDefault();
    onOpenGallery?.();
  };

  const galleryClass = cn(GALLERY_BTN, !hasPhotos && 'text-blue-600');

  return (
    <div className={cn('pointer-events-auto flex shrink-0 items-center gap-1', className)}>
      {onOpenGallery ? (
        <button
          type="button"
          onClick={openGallery}
          aria-label={hasPhotos ? `View ${safeCount} photos` : 'Open photo gallery'}
          className={cn('ds-raw-button', galleryClass)}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          <GalleryPhotoCount count={safeCount} className="text-role-caption" />
        </button>
      ) : (
        <Link
          href={galleryHref}
          prefetch={false}
          onClick={stop}
          aria-label={hasPhotos ? `View ${safeCount} photos` : 'Open photo gallery'}
          className={galleryClass}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          <GalleryPhotoCount count={safeCount} className="text-role-caption" />
        </Link>
      )}
      <Link
        href={captureHref}
        prefetch={false}
        onClick={stop}
        aria-label="Take more photos"
        className={cn(BTN, 'bg-blue-600 text-white active:bg-blue-700')}
      >
        <Camera className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
