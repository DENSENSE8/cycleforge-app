'use client';

/** Thumbnails for photos staged against the next ticket comment — one strip for the Support console composer, the Unbox station Ticket… */

import { IconButton } from '@/design-system/primitives';
import { X } from '@/components/Icons';
import type { StagedPhoto } from '@/hooks/useTicketPhotoStaging';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export function ComposerStagedPhotoStrip({
  staged,
  onRemove,
  onOpen,
  size = 'default',
  className,
}: {
  staged: readonly StagedPhoto[];
  onRemove: (tempId: string) => void;
  /** Open the staged photo at `index` full screen. Omit where there is no viewer. */
  onOpen?: (index: number) => void;
  /** `compact` — the station dock inset, where vertical space is the budget. */
  size?: 'default' | 'compact';
  className?: string;
}) {
  if (staged.length === 0) return null;
  const box = size === 'compact' ? 'h-10 w-10' : 'h-14 w-14';
  return (
    <div
      data-testid="composer-staged-photos"
      className={cn('flex flex-wrap gap-1.5', className)}
    >
      {staged.map((s, index) => (
        <div
          key={s.tempId}
          className={cn(
            'group/staged relative overflow-hidden rounded-lg ring-1 ring-inset',
            box,
            s.status === 'error' ? 'ring-rose-300' : 'ring-border-soft',
          )}
        >
          {onOpen ? (
            // ds-raw-button: the photo itself is the hit target; a Button face would paint chrome over the thumbnail.
            <button
              type="button"
              onClick={() => onOpen(index)}
              aria-label={`View ${s.name} full screen`}
              className={cn('ds-raw-button block h-full w-full cursor-zoom-in', focusRing('control', 'accent'))}
            >
              <img src={s.thumbUrl || s.previewUrl} alt={s.name} className="h-full w-full object-cover" />
            </button>
          ) : (
            <img src={s.thumbUrl || s.previewUrl} alt={s.name} className="h-full w-full object-cover" />
          )}
          {s.status === 'uploading' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-scrim/30">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            </div>
          ) : null}
          {s.status === 'error' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-rose-900/40 text-role-micro text-white">
              Failed
            </div>
          ) : null}
          <IconButton
            onClick={() => onRemove(s.tempId)}
            ariaLabel="Remove"
            icon={<X className="h-2.5 w-2.5" />}
            // ds-allow-raw-neutral: glass overlay pinned on an image thumbnail — photo doesn't theme, stays dark
            // Shown on hover / focus where a pointer can hover; always shown on touch, which cannot.
            className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-scrim/70 text-white transition-opacity hover:bg-gray-900 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/staged:opacity-100 [@media(hover:hover)]:group-focus-within/staged:opacity-100"
          />
        </div>
      ))}
    </div>
  );
}
