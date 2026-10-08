'use client';

import { useEffect, useRef, useState } from 'react';
import { isImageReady, preloadImage } from './image-preload';
import { parsePhotos, photosFingerprint, type PhotoGalleryInput, type PhotoItem } from './photo-gallery-utils';

/** Photos on each side of the current one whose display image is warmed for instant ←/→. */
const NEIGHBOUR_RADIUS = 2;

interface UsePhotoItems {
  photoItems: PhotoItem[];
  setPhotoItems: React.Dispatch<React.SetStateAction<PhotoItem[]>>;
  /** Clear the fingerprint so the next render re-inits from `photos`. */
  resetFingerprint: () => void;
  loadedCount: number;
  errorCount: number;
}

/**
 * Parses the mixed photo input into `PhotoItem`s and preloads them.
 *
 * `status` rides the THUMB (`thumbUrl ?? url`): the launcher paints ~10KB
 * thumbs, and gating those tiles on the full-res preload kept every tile a
 * skeleton until ~250KB per photo (plus a 302 hop) landed — on `/unbox`, five
 * full-size photos per cold load for a viewer nobody had opened.
 *
 * `full` rides the viewer's `displayUrl`, loaded only while the viewer is open:
 * the CURRENT photo first and alone, then its neighbours once it has landed —
 * never every photo at once competing with the one on screen.
 */
export function usePhotoItems(
  photos: PhotoGalleryInput[],
  viewerOpen: boolean,
  currentIndex: number,
): UsePhotoItems {
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);
  const photosFingerprintRef = useRef<string | null>(null);
  /** Thumb URLs already handed to an `Image()` — a re-render must not re-issue a pending load. */
  const startedRef = useRef(new Set<string>());
  /** Display URLs with a load in flight (settled ones re-resolve instantly from `preloadImage`). */
  const pendingRef = useRef(new Set<string>());

  useEffect(() => {
    const parsed = parsePhotos(photos);
    const fingerprint = photosFingerprint(parsed);
    if (photosFingerprintRef.current === fingerprint) return;
    photosFingerprintRef.current = fingerprint;

    setPhotoItems(
      parsed.map((p, index) => ({
        id: p.id,
        url: p.url,
        displayUrl: p.displayUrl,
        thumbUrl: p.thumbUrl,
        status: 'loading',
        // A tile press already fetched+decoded it → the viewer's first frame is the sharp image.
        full: isImageReady(p.displayUrl) ? 'loaded' : undefined,
        index,
        meta: p.meta,
      })),
    );
  }, [photos]);

  useEffect(() => {
    const patchAt = (index: number, patch: Partial<PhotoItem>) =>
      setPhotoItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    const started = startedRef.current;
    photoItems.forEach((photo, index) => {
      const tileUrl = photo.thumbUrl ?? photo.url;
      if (photo.status === 'loading' && !started.has(`tile:${tileUrl}`)) {
        started.add(`tile:${tileUrl}`);
        const img = new Image();
        img.onload = () => patchAt(index, { status: 'loaded' });
        img.onerror = () => {
          started.delete(`tile:${tileUrl}`);
          patchAt(index, { status: 'error' });
        };
        img.src = tileUrl;
      }
    });
  }, [photoItems]);

  useEffect(() => {
    const count = photoItems.length;
    if (!viewerOpen || count === 0) return;
    const pending = pendingRef.current;
    // Patch by URL, not index — a delete/upload can reindex the list mid-load.
    const patchUrl = (url: string, full: PhotoItem['full']) =>
      setPhotoItems((prev) => prev.map((item) => (item.displayUrl === url ? { ...item, full } : item)));
    const load = (index: number, priority: 'high' | 'low') => {
      const photo = photoItems[index];
      if (!photo || photo.full || pending.has(photo.displayUrl)) return;
      const url = photo.displayUrl;
      pending.add(url);
      preloadImage(url, priority).then(
        () => {
          pending.delete(url);
          patchUrl(url, 'loaded');
        },
        () => {
          pending.delete(url);
          patchUrl(url, 'error');
        },
      );
    };

    load(currentIndex, 'high');
    // Neighbours wait for the opened photo so they never share its bandwidth.
    if (!photoItems[currentIndex]?.full) return;
    for (let d = 1; d <= NEIGHBOUR_RADIUS; d++) {
      load((currentIndex + d) % count, 'low');
      load((currentIndex - d + count) % count, 'low');
    }
  }, [photoItems, viewerOpen, currentIndex]);

  return {
    photoItems,
    setPhotoItems,
    resetFingerprint: () => {
      photosFingerprintRef.current = null;
    },
    loadedCount: photoItems.filter((p) => p.status === 'loaded').length,
    errorCount: photoItems.filter((p) => p.status === 'error').length,
  };
}
