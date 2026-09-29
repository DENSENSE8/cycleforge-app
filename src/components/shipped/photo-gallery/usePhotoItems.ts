'use client';

import { useEffect, useRef, useState } from 'react';
import { parsePhotos, photosFingerprint, type PhotoGalleryInput, type PhotoItem } from './photo-gallery-utils';

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
 * full-size photos per cold load for a viewer nobody had opened. The full-res
 * image preloads only while the viewer is open, into `full`.
 */
export function usePhotoItems(photos: PhotoGalleryInput[], viewerOpen: boolean): UsePhotoItems {
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);
  const photosFingerprintRef = useRef<string | null>(null);
  /** URLs already handed to an `Image()` — a re-render must not re-issue a pending load. */
  const startedRef = useRef(new Set<string>());

  useEffect(() => {
    const parsed = parsePhotos(photos);
    const fingerprint = photosFingerprint(parsed);
    if (photosFingerprintRef.current === fingerprint) return;
    photosFingerprintRef.current = fingerprint;

    setPhotoItems(
      parsed.map((p, index) => ({ id: p.id, url: p.url, thumbUrl: p.thumbUrl, status: 'loading', index, meta: p.meta })),
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
      // Full-res for the open viewer. Capturing `naturalWidth/Height` here
      // (rather than a DB column) gives the info panel real dimensions for free.
      if (viewerOpen && !photo.full && !started.has(`full:${photo.url}`)) {
        started.add(`full:${photo.url}`);
        const img = new Image();
        img.onload = () =>
          patchAt(index, { full: 'loaded', naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
        img.onerror = () => {
          started.delete(`full:${photo.url}`);
          patchAt(index, { full: 'error' });
        };
        img.src = photo.url;
      }
    });
  }, [photoItems, viewerOpen]);

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
