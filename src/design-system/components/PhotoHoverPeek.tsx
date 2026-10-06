'use client';

/**
 * PhotoHoverPeek — the ONE thumbnail behaviour for every data-table row
 * (RecordCard, TriageRow, the compound grid's photo gutter, the outbound
 * ledger's photo lane).
 *
 * - Hover (mouse, after a short intent delay) = a read-only enlargement at ONE
 *   fixed size, whatever the photo's pixels: an 18rem square, the photo
 *   contained inside it, captioned "Click to view full screen" along the
 *   bottom.
 * - Click / Enter = the shared fullscreen viewer (`PhotoViewerPortal` via
 *   `LightboxPortal` — the same viewer Unbox opens), or the caller's own
 *   `onOpen` when it has a richer photo set to show.
 * - Touch never peeks; a tap goes straight to fullscreen.
 *
 * No `src` → the children paint as-is: nothing to enlarge, nothing to open.
 */

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Maximize2 } from '@/components/Icons';
import { LightboxPortal } from '@/components/photos/photo-library-grid/LightboxPortal';
import { Popover, PopoverAnchor, PopoverContent } from '@/design-system/primitives/radix-popover';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

const PEEK_SPRING = { type: 'spring', stiffness: 460, damping: 34, mass: 0.8 } as const;
const PEEK_ENTER_MS = 320;
const PEEK_LEAVE_MS = 120;

/** The enlargement's box — fixed, so every row's peek reads at the same size. */
export const PHOTO_PEEK_BOX_CLASS = 'size-72';

export function PhotoHoverPeek({
  src,
  fullSrc,
  alt,
  onOpen,
  className,
  children,
  testId,
}: {
  /** The photo the peek paints; null = no peek (and, without `onOpen`, no open). */
  src: string | null | undefined;
  /** Original image for fullscreen; `src` remains the lightweight thumbnail / peek source. */
  fullSrc?: string | null | undefined;
  /** Names the photo — the peek's alt and the trigger's aria label. */
  alt: string;
  /** Replace the built-in single-photo viewer (e.g. a lane that loads every photo of the item); keeps the thumb clickable with no `src`. */
  onOpen?: () => void;
  /** The trigger box — the thumbnail's own size / surface classes. */
  className?: string;
  /** The thumbnail itself. */
  children: ReactNode;
  testId?: string;
}) {
  const [peekOpen, setPeekOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const url = src?.trim() || null;
  const fullUrl = fullSrc?.trim() || url;
  const enter = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || !url) return;
    clear();
    timer.current = window.setTimeout(() => setPeekOpen(true), PEEK_ENTER_MS);
  };
  const leave = () => {
    clear();
    timer.current = window.setTimeout(() => setPeekOpen(false), PEEK_LEAVE_MS);
  };

  // Nothing to enlarge and nothing to open: the thumbnail paints as-is.
  if (!url && !onOpen) {
    return (
      <span className={className} data-testid={testId}>
        {children}
      </span>
    );
  }

  const open = () => {
    clear();
    setPeekOpen(false);
    if (onOpen) onOpen();
    else setViewerOpen(true);
  };

  return (
    <>
      <Popover open={peekOpen && url != null} onOpenChange={setPeekOpen}>
        <PopoverAnchor asChild>
          <button
            type="button"
            aria-label={`View ${alt} full screen`}
            data-testid={testId}
            onPointerEnter={enter}
            onPointerLeave={leave}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              open();
            }}
            className={cn('ds-raw-button pointer-events-auto relative cursor-zoom-in', focusRing('control'), className)}
          >
            {children}
          </button>
        </PopoverAnchor>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerEnter={enter}
          onPointerLeave={leave}
          // A portal still bubbles through the React tree — keep the row's own open target out of it.
          onClick={(event) => {
            event.stopPropagation();
            open();
          }}
          data-testid={testId ? `${testId}-peek` : undefined}
          className={cn('w-auto cursor-zoom-in overflow-hidden border-0 p-0 shadow-elev-overlay', cornerClass('surface'))}
        >
          <motion.figure
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={PEEK_SPRING}
            style={{ transformOrigin: 'var(--radix-popover-content-transform-origin)' }}
            className="flex flex-col bg-mode-panel"
          >
            {/* White ground, not a gray well: a photo off the square's ratio reads as the photo on white, never as bars. */}
            <span className={cn('flex items-center justify-center bg-surface-card', PHOTO_PEEK_BOX_CLASS)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary catalog / photo URLs */}
              <img src={url ?? undefined} alt={alt} decoding="async" className="size-full object-contain" />
            </span>
            <figcaption className="flex items-center justify-center gap-1.5 border-t border-mode-rule px-3 py-2 text-role-caption font-medium text-mode-ink">
              <Maximize2 className="size-3.5" />
              Click to view full screen
            </figcaption>
          </motion.figure>
        </PopoverContent>
      </Popover>
      {viewerOpen && fullUrl ? (
        // The viewer portals to <body>, but its events still bubble through the React tree into the row.
        <span className="contents" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          <LightboxPortal photos={[{ url: fullUrl, thumbUrl: url ?? undefined }]} onClose={() => setViewerOpen(false)} />
        </span>
      ) : null}
    </>
  );
}
