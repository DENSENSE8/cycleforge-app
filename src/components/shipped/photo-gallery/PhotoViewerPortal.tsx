'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from '@/design-system/motion';
import { useBodyScrollLock } from '@/design-system/hooks';
import { PhotoViewerModal } from './PhotoViewerModal';
import type { PhotoGalleryController } from './usePhotoGallery';

/**
 * SoT mount shell for {@link PhotoViewerModal}.
 *
 * Owns the body portal, `present`-until-exit teardown (RightPaneOverlay pattern),
 * a stable AnimatePresence key, and scroll-lock through the exit fade. Hosts
 * must render this — never a local `createPortal` + `AnimatePresence mode="wait"`
 * fork (that deadlocks the scrim and leaves a ghost overlay).
 */
export function PhotoViewerPortal({
  g,
  onDismissed,
}: {
  g: PhotoGalleryController;
  /** Fired once after the exit fade finishes and the portal tears down. */
  onDismissed?: () => void;
}) {
  const open = g.viewerOpen;
  const [present, setPresent] = useState(open);
  const openedRef = useRef(false);

  useLayoutEffect(() => {
    if (open) {
      setPresent(true);
      openedRef.current = true;
    }
  }, [open]);

  // Lock through the exit fade so the page doesn't scroll under a fading scrim.
  useBodyScrollLock(present);

  const handleExitComplete = () => {
    if (open) return;
    setPresent(false);
    if (openedRef.current) {
      openedRef.current = false;
      onDismissed?.();
    }
  };

  if (typeof document === 'undefined' || !g.mounted || !present) return null;

  return createPortal(
    // Default (sync) mode + stable key — required for AnimatePresence to run
    // the scrim exit and unmount. `mode="wait"` + a keyless child deadlocks when
    // the parent re-renders mid-exit (ghost full-screen scrim).
    <AnimatePresence onExitComplete={handleExitComplete}>
      {open ? <PhotoViewerModal key="photo-lightbox" g={g} /> : null}
    </AnimatePresence>,
    document.body,
  );
}
