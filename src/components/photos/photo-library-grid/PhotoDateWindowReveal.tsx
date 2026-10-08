'use client';

/**
 * Date-window reveal — when the sidebar / breadcrumb moves `dateFrom`/`dateTo`,
 * the new wall settles in as ONE motion (fade + short rise) instead of a hard
 * swap. One wrapper animates, never the tiles, so hundreds of thumbnails cost
 * a single composited layer. Reduced motion (and the first paint) is instant.
 */

import { useState, type ReactNode } from 'react';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { motion, useReducedMotion } from '@/design-system/motion';
import { usePhotoLibraryUrlState } from '@/hooks/usePhotoLibraryUrlState';
import type { LibraryPhoto } from '../photo-library-types';

/**
 * Bumps when the photos for a NEW date window land. Keyed on data arrival, not
 * the URL: `keepPreviousData` holds the old wall while the next window loads,
 * so keying on the URL alone would animate stale tiles and then hard-cut.
 * Same-window refreshes (load more, delete) keep the key.
 */
export function usePhotoDateWindowRevealKey(photos: LibraryPhoto[]): number {
  const { filters } = usePhotoLibraryUrlState();
  const windowKey = `${filters.dateFrom ?? ''}..${filters.dateTo ?? ''}`;
  const [shown, setShown] = useState({ windowKey, photos, revealKey: 0 });
  if (shown.photos === photos) return shown.revealKey;
  const revealKey = shown.windowKey === windowKey ? shown.revealKey : shown.revealKey + 1;
  setShown({ windowKey, photos, revealKey });
  return revealKey;
}

export function PhotoDateWindowReveal({
  revealKey,
  children,
}: {
  revealKey: number;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      key={revealKey}
      initial={revealKey === 0 || reduceMotion ? false : motionPresence.tableRow.initial}
      animate={motionPresence.tableRow.animate}
      transition={motionTransition.tableRowMount}
    >
      {children}
    </motion.div>
  );
}
