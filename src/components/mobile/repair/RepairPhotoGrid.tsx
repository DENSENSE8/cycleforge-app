'use client';

import type { RepairMediaItem } from '@/lib/repair/repair-photos';
import { formatMegabytes } from '@/lib/photos/video-upload-rules';
import { Play } from '@/components/Icons';
import { cn } from '@/utils/_cn';

/** Three-up square grid of a repair's photos and videos (one timeline, see `repairMediaTimeline`). */
export function RepairPhotoGrid({
  items,
  selecting,
  selectedIds,
  onOpen,
  onToggle,
}: {
  items: readonly RepairMediaItem[];
  selecting: boolean;
  /** Ordered photo ids — the attach order on the ticket. */
  selectedIds: readonly number[];
  onOpen: (index: number) => void;
  onToggle: (photoId: number) => void;
}) {
  let photoNumber = 0;
  let videoNumber = 0;
  return (
    <ul className="grid grid-cols-3 gap-1.5" aria-label="Repair photos and videos">
      {items.map((item, index) => {
        const tile = 'relative block aspect-square w-full overflow-hidden rounded-mode border bg-mode-panel';
        if (item.kind === 'video') {
          videoNumber += 1;
          const { video } = item;
          return (
            <li key={`v${video.id}`}>
              {/* ds-raw-button: square video tile, not a text/action button */}
              <button
                type="button"
                onClick={() => onOpen(index)}
                disabled={selecting}
                aria-label={`Play video ${videoNumber}`}
                className={cn(tile, 'border-mode-edge active:opacity-90 disabled:opacity-40')}
              >
                <video
                  src={`${video.url}#t=0.1`}
                  preload="metadata"
                  muted
                  playsInline
                  aria-hidden
                  className="pointer-events-none h-full w-full bg-black object-cover"
                />
                <span aria-hidden className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-scrim/45 text-white">
                    <Play className="h-5 w-5" />
                  </span>
                </span>
                <span className="absolute bottom-1 right-1 rounded-full bg-scrim/60 px-1.5 text-role-micro font-semibold tabular-nums text-white">
                  {formatMegabytes(video.sizeBytes)}
                </span>
              </button>
            </li>
          );
        }
        photoNumber += 1;
        const { photo } = item;
        const order = selectedIds.indexOf(photo.id);
        const selected = order >= 0;
        return (
          <li key={`p${photo.id}`}>
            {/* ds-raw-button: square image tile, not a text/action button */}
            <button
              type="button"
              onClick={() => (selecting ? onToggle(photo.id) : onOpen(index))}
              aria-pressed={selecting ? selected : undefined}
              aria-label={selecting ? `Select photo ${photoNumber}` : `Open photo ${photoNumber}`}
              className={cn(
                tile,
                'active:opacity-90',
                selected ? 'border-fill-info ring-2 ring-inset ring-fill-info' : 'border-mode-edge',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumbUrl}
                alt={`Repair photo ${photoNumber}`}
                loading="lazy"
                decoding="async"
                className={cn('h-full w-full object-cover', selecting && !selected && 'opacity-80')}
              />
              {selecting ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 text-role-micro font-bold',
                    selected ? 'border-fill-info bg-fill-info text-white' : 'border-white bg-scrim/30',
                  )}
                >
                  {selected ? order + 1 : null}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
