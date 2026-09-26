'use client';

/** Phone record photo lane → every photo of this item # + SKU ({@link fetchLinePhotos}, the desk ledger's fetcher) in the phone viewer… */

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MobileSwipePhotoViewer, type SwipePhotoSlide } from '@/components/mobile/station/MobileSwipePhotoViewer';
import {
  fetchLinePhotos,
  linePhotoLabel,
  linePhotosQueryKey,
  type LinePhotoSubject,
} from '@/lib/photos/line-photos';
import { toast } from '@/lib/toast';

export function MobileLinePhotoViewer({
  subject,
  onClose,
}: {
  subject: LinePhotoSubject;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: linePhotosQueryKey(subject),
    queryFn: () => fetchLinePhotos(subject),
    staleTime: 60_000,
  });
  const photos = query.data;
  const label = linePhotoLabel(subject.itemNumber, subject.sku);

  useEffect(() => {
    if (query.isError) {
      toast.error(`Could not load photos for ${label}`);
      onClose();
    } else if (photos && photos.length === 0) {
      toast.info(`No photos for ${label}`);
      onClose();
    }
  }, [query.isError, photos, label, onClose]);

  const slides = useMemo<SwipePhotoSlide[]>(
    () => (photos ?? []).map((p, i) => ({ id: p.id != null ? String(p.id) : `hero-${i}`, previewUrl: p.url })),
    [photos],
  );

  return (
    <MobileSwipePhotoViewer
      slides={slides}
      open={slides.length > 0}
      presentation="sheet"
      onClose={onClose}
    />
  );
}
