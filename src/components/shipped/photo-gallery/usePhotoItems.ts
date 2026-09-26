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

/** Parses the mixed photo input into `PhotoItem`s and preloads each image, flipping its status to loaded/error. */
export function usePhotoItems(photos: PhotoGalleryInput[]): UsePhotoItems {
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);
  const photosFingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    const parsed = parsePhotos(photos);
    const fingerprint = photosFingerprint(parsed);
    if (photosFingerprintRef.current === fingerprint) return;
    photosFingerprintRef.current = fingerprint;

    setPhotoItems(
      parsed.map((p, index) => ({ id: p.id, url: p.url, thumbUrl: p.thumbUrl, status: 'loading', index, meta: p.meta })),
    );
  }, [photos]);

  // Preload images. Capturing `naturalWidth/Height` here (rather than a DB
  // column) gives the viewer's info panel real dimensions for free — the image
  // is already being fetched to flip the loaded/error status.
  useEffect(() => {
    photoItems.forEach((photo, index) => {
      if (photo.status === 'loading') {
        const img = new Image();
        img.onload = () => {
          setPhotoItems((prev) =>
            prev.map((item, i) =>
              i === index
                ? { ...item, status: 'loaded', naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight }
                : item,
            ),
          );
        };
        img.onerror = () => {
          setPhotoItems((prev) => prev.map((item, i) => (i === index ? { ...item, status: 'error' } : item)));
        };
        img.src = photo.url;
      }
    });
  }, [photoItems]);

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
