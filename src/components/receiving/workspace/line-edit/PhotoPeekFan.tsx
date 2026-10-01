'use client';

/** PhotoPeekFan — presentational, data-free photo "peek" gesture + Quick Look. */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from '@/design-system/motion';
import { motionBezier } from '@/design-system/foundations/motion-presets';
import { useEscapeClose } from '@/design-system/hooks';
import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { buildUnboxingCartonLibraryHref } from '@/components/shipped/photo-gallery/photo-context-provenance';
import { MovePhotosBetweenPoRail } from '@/components/receiving/workspace/line-edit/MovePhotosBetweenPoRail';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import SocialCards, { type CardItem } from '@/components/ui/card-fan-carousel';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { MobileSwipePhotoViewer, type SwipePhotoSlide } from '@/components/mobile/station/MobileSwipePhotoViewer';
import { type PeekCard } from './photo-peek-pending';
import { PhotoPeekStack } from './PhotoPeekStack';

export type { PeekCard };


const CTRL_BTN =
  'grid place-items-center rounded-full bg-scrim/40 text-white backdrop-blur-md transition-colors hover:bg-scrim/65 disabled:opacity-30';

// ── Peek + fan ────────────────────────────────────────────────────────────────

export function PhotoPeekFan({
  cards,
  holdMs = 480,
  receivingId,
  poRef,
  onPhotoDeleted,
  onOpenMovePhotosExternal,
  placement = 'pane',
}: {
  cards: PeekCard[];
  holdMs?: number;
  /** Scopes delete broadcasts to this carton (desktop camera ×N + mobile feed). */
  receivingId?: number;
  /** PO#/order ref for the unboxing media-library deep link. */
  poRef?: string | null;
  /** Wired so the viewer's delete affordance can refresh the source list. */
  onPhotoDeleted?: (photoId: number) => void;
  /** Open Move photos in a caller-owned inline or rail surface. */
  onOpenMovePhotosExternal?: () => void;
  /**
   * `pane`: parks itself on the positioned pane's right edge, above the dock band.
   * `inline`: the bare peek — the host places it (`DeskRecordLayout`'s `peek` edge).
   */
  placement?: 'pane' | 'inline';
}) {
  // Expanded and fullscreen views contain committed photos only. Pending cards
  // remain visible in the compact peek until their durable image URL arrives.
  const chronoCards = useMemo(() => [...cards].reverse(), [cards]);
  const viewableCards = useMemo(
    () => chronoCards.filter((card) => !card.pending && !!card.imgUrl),
    [chronoCards],
  );
  const fanItems = useMemo<CardItem[]>(
    () => viewableCards.map((card) => ({ imgUrl: card.imgUrl, alt: card.alt })),
    [viewableCards],
  );
  // Build gallery inputs with numeric ids when available so the viewer's delete
  // affordance shows here too (parity with the top-bar ReceivingPhotoButton).
  // Demo cards use non-numeric ids → those stay read-only. Pending excluded.
  const chronoPhotos = useMemo<PhotoGalleryInput[]>(
    () =>
      viewableCards.map((c) => {
        const idNum = Number(c.id);
        // The viewer zooms/pans — it takes the full-resolution source, never the
        // downscaled tile the fan renders (`imgUrl` may be a thumb variant).
        const url = c.fullUrl || c.imgUrl;
        const base = Number.isFinite(idNum) ? { id: idNum, url } : { url };
        return c.meta ? { ...base, meta: c.meta } : base;
      }),
    [viewableCards],
  );

  const cartonLibraryHref = receivingId
    ? buildUnboxingCartonLibraryHref({ receivingId, poRef: poRef ?? null })
    : undefined;

  // Reuse the shared gallery's fullscreen viewer (zoom/pan/nav/filmstrip + delete)
  // instead of a bespoke lightbox.
  const gallery = usePhotoGallery({
    photos: chronoPhotos,
    receivingId,
    allowReassign: !!receivingId,
    libraryHref: cartonLibraryHref,
    onPhotoDeleted,
    onPhotoReassigned: onPhotoDeleted,
    onOpenMovePhotosExternal,
  });
  const { viewerOpen, openViewer } = gallery;

  const [peekState, setPeekState] = useState<'rest' | 'fan'>('rest');
  const [expanded, setExpanded] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Escape on the bare fan (no viewer) fully closes back to the resting peek.
  // The viewer owns Esc while it's open (usePhotoGallery), returning to the fan.
  useEscapeClose(expanded && !viewerOpen, () => {
    setExpanded(false);
    setPeekState('rest');
  });

  const openFanCard = useCallback(
    (chronoIndex: number) => {
      const card = chronoCards[chronoIndex];
      if (!card || card.pending) return;
      const viewIndex = viewableCards.findIndex((c) => c.id === card.id);
      if (viewIndex >= 0) openViewer(viewIndex);
    },
    [chronoCards, viewableCards, openViewer],
  );

  // Space opens the newest committed photo in the viewer while the fan is up.
  useEffect(() => {
    if (!expanded || viewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (viewableCards.length === 0) return;
        openViewer(viewableCards.length - 1); // newest committed is right-most among viewable
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, viewerOpen, openViewer, viewableCards.length]);

  // Dismissing the viewer (Esc / X / backdrop) collapses the whole peek too —
  // one dismiss closes BOTH the photo viewer and the expanded fan behind it.
  const prevViewerOpenRef = useRef(false);
  useEffect(() => {
    if (prevViewerOpenRef.current && !viewerOpen) {
      setExpanded(false);
      setPeekState('rest');
    }
    prevViewerOpenRef.current = viewerOpen;
  }, [viewerOpen]);

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const onPeekEnter = () => {
    setPeekState('fan');
    clearHold();
    if (viewableCards.length > 0) {
      holdTimer.current = setTimeout(() => setExpanded(true), holdMs);
    }
  };
  const onPeekLeave = () => {
    setPeekState('rest');
    clearHold();
  };
  const openNow = () => {
    clearHold();
    if (viewableCards.length > 0) setExpanded(true);
  };
  const close = () => {
    setExpanded(false);
    setPeekState('rest');
  };

  useEffect(() => () => clearHold(), []);

  const { isMobile } = useUIModeOptional();

  const swipeSlides = useMemo<SwipePhotoSlide[]>(
    () =>
      gallery.photoItems.map((p, idx) => ({
        id: String(p.id ?? idx),
        previewUrl: p.url,
        deletable: typeof p.id === 'number' && Number.isFinite(p.id),
      })),
    [gallery.photoItems],
  );

  const handleDelete = useCallback(
    async (slide: SwipePhotoSlide, index: number) => {
      gallery.setCurrentIndex(index);
      await gallery.deletePhotoDirect();
    },
    [gallery],
  );

  if (cards.length === 0) return null;

  return (
    <>
      <PhotoPeekStack
        cards={cards}
        placement={placement}
        hidden={expanded}
        state={peekState}
        onEnter={onPeekEnter}
        onLeave={onPeekLeave}
        onOpen={openNow}
      />

      {/* Expanded display — a full-viewport overlay portaled to <body> (like the photo viewer), so the fan centers on the absolute middle of the… */}
      {gallery.mounted && typeof document !== 'undefined'
        ? createPortal(
            <AnimatePresence>
              {expanded ? (
                <motion.div
                  key="photo-fan-expanded"
                  data-testid="photo-peek-expanded"
                  initial={{ opacity: 0, pointerEvents: 'auto' }}
                  animate={{ opacity: 1, pointerEvents: 'auto' }}
                  exit={{ opacity: 0, pointerEvents: 'none' }}
                  transition={{ duration: 0.2, ease: motionBezier.easeOut }}
                  onClick={viewerOpen ? undefined : close}
                  className={cn(
                    'fixed inset-0 z-modalBackdrop flex items-center justify-center overflow-hidden bg-scrim/95 backdrop-blur-sm',
                    viewerOpen && 'pointer-events-none',
                  )}
                >
                  {/* Fan's own close — hidden while the fullscreen viewer is open so
                      its button doesn't stack a second X above the viewer. */}
                  {!viewerOpen ? (
                    <IconButton
                      onClick={(e) => { e.stopPropagation(); close(); }}
                      ariaLabel="Close"
                      icon={<X className="h-4 w-4 text-white" />}
                      className={`${CTRL_BTN} absolute right-3 top-3 z-50 h-9 w-9`}
                    />
                  ) : null}

                  {/* Fan stage — the shared GSAP card-fan carousel (hover to spread, arrows/dots to page when >7 photos). */}
                  <div
                    className={`isolate w-full ${viewerOpen ? 'pointer-events-none' : ''}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SocialCards cards={fanItems} onCardClick={openFanCard} cardTestId="fan-card" />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}

      {/* Shared fullscreen viewer — SoT portal; X / Esc / backdrop close
          (usePhotoGallery), returning to the fan underneath. */}
      {isMobile ? (
        <MobileSwipePhotoViewer
          open={viewerOpen}
          initialIndex={gallery.currentIndex}
          slides={swipeSlides}
          onClose={gallery.closeViewer}
          onDelete={handleDelete}
        />
      ) : (
        <PhotoViewerPortal g={gallery} />
      )}

      {!onOpenMovePhotosExternal && gallery.canReassignCurrent && receivingId != null ? (
        <MovePhotosBetweenPoRail
          key={gallery.movePhotosKey}
          open={gallery.movePhotosOpen}
          receivingId={receivingId}
          onClose={gallery.closeMovePhotos}
          onMoved={() => onPhotoDeleted?.(0)}
        />
      ) : null}
    </>
  );
}
