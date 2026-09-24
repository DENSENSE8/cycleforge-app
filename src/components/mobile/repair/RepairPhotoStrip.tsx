'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { SkeletonBase } from '@/design-system/components/Skeletons';
import { formatMonthDayTimePST } from '@/utils/date';
import {
  MobileSwipePhotoViewer,
  type SwipePhotoSlide,
} from '@/components/mobile/station/MobileSwipePhotoViewer';

interface RepairPhoto {
  id: number;
  url: string;
  thumbUrl: string;
  photoType: string | null;
  createdAt: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; photos: RepairPhoto[] };

/**
 * Read-only intake photo strip for the mobile repair workbench. Self-fetches
 * `GET /api/repair-service/[id]/photos` (oldest first); tap a thumb to open the
 * full-screen swipe viewer. No upload, delete, or relink. The page supplies the
 * section heading.
 */
export function RepairPhotoStrip({ repairId }: { repairId: number }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    fetch(`/api/repair-service/${repairId}/photos`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { photos?: RepairPhoto[] };
        setState({ kind: 'ready', photos: body.photos ?? [] });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      });
    return () => controller.abort();
  }, [repairId, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const photos = useMemo(() => (state.kind === 'ready' ? state.photos : []), [state]);

  const slides = useMemo<SwipePhotoSlide[]>(
    () => photos.map((p) => ({ id: String(p.id), previewUrl: p.url })),
    [photos],
  );

  const openViewer = useCallback((index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  }, []);

  if (state.kind === 'loading') {
    return (
      <div className="flex gap-2 overflow-hidden" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBase key={i} width="72px" height="72px" className="shrink-0 rounded-mode" />
        ))}
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-role-caption text-rose-600">Couldn&apos;t load photos.</p>
        <Button variant="secondary" size="lg" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  }

  if (photos.length === 0) {
    return <p className="text-role-caption text-mode-muted">No photos are linked to this repair yet.</p>;
  }

  // Helper returns oldest first, so the last entry is the newest.
  const newest = photos[photos.length - 1];
  const countLabel = photos.length === 1 ? '1 photo' : `${photos.length} photos`;

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex snap-x gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {photos.map((p, index) => (
            // ds-raw-button: square image thumbnail tile, not a text/action button
            <button
              key={p.id}
              type="button"
              onClick={() => openViewer(index)}
              aria-label={`Open intake photo ${index + 1}`}
              className="relative h-[72px] w-[72px] shrink-0 snap-start overflow-hidden rounded-mode border border-mode-edge bg-mode-panel active:opacity-90"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.thumbUrl}
                alt={`Intake photo ${index + 1}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
        <p className="text-role-caption text-mode-muted">
          {countLabel} · newest {formatMonthDayTimePST(newest.createdAt)}
        </p>
      </div>

      <MobileSwipePhotoViewer
        presentation="sheet"
        open={viewerOpen}
        initialIndex={viewerIndex}
        slides={slides}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
}
