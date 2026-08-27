'use client';

/**
 * Compact testing + packing photo strip for the RETURN serial-match band.
 *
 * Fetches the unit timeline photo spine via the shared
 * {@link unitTimelinePhotosQuery} cache (same key as Displays → Timeline →
 * Units). Only outbound stages render here — inbound arrival/unbox stay on
 * Photos Displays / the full journey.
 *
 * Presentational host: parent owns match state; this owns the photo query.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@/components/Icons';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { photoStageLabel } from '@/lib/photos/stages';
import { unitTimelinePhotosQuery } from '@/lib/timeline/journey-photos';
import type { UnitTimelinePhotoRow } from '@/lib/timeline/unit-photos-events';
import { cn } from '@/utils/_cn';

type OutboundPhotoSource = 'testing' | 'packing';

const OUTBOUND_SOURCES: readonly OutboundPhotoSource[] = ['testing', 'packing'];

const SOURCE_STAGE: Record<OutboundPhotoSource, 'testing' | 'packing'> = {
  testing: 'testing',
  packing: 'packing',
};

function groupOutbound(
  photos: UnitTimelinePhotoRow[],
): Array<{ source: OutboundPhotoSource; rows: UnitTimelinePhotoRow[] }> {
  const out: Array<{ source: OutboundPhotoSource; rows: UnitTimelinePhotoRow[] }> = [];
  for (const source of OUTBOUND_SOURCES) {
    const rows = photos
      .filter((p) => p.source === source)
      .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
    if (rows.length > 0) out.push({ source, rows });
  }
  return out;
}

function StageThumbRow({
  label,
  rows,
  onOpen,
}: {
  label: string;
  rows: UnitTimelinePhotoRow[];
  onOpen: (photoId: number) => void;
}) {
  const visible = rows.slice(0, 4);
  const overflow = rows.length - visible.length;

  return (
    <div className="min-w-0">
      <p className="mb-1 text-role-micro font-semibold uppercase tracking-widest text-emerald-700/80">
        {label}
        <span className="ml-1 tabular-nums text-emerald-600/60">{rows.length}</span>
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {visible.map((r) => (
          <button
            key={r.photoId}
            type="button"
            // ds-raw-button: photo thumb open — not a DS Button surface
            className="ds-raw-button block shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-emerald-200 transition-opacity hover:opacity-90"
            onClick={() => onOpen(r.photoId)}
            aria-label={`View ${label} photo`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.thumbUrl}
              alt={label}
              loading="lazy"
              className="h-12 w-12 object-cover"
            />
          </button>
        ))}
        {overflow > 0 ? (
          <button
            type="button"
            // ds-raw-button: +N overflow open — not a DS Button surface
            className="ds-raw-button flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface-card text-role-caption font-semibold tabular-nums text-emerald-800 ring-1 ring-inset ring-emerald-200 transition-opacity hover:opacity-90"
            onClick={() => onOpen(visible[visible.length - 1]?.photoId ?? rows[0]!.photoId)}
            aria-label={`View ${overflow} more ${label} photos`}
          >
            +{overflow}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ReturnOutboundEvidenceStrip({
  serialUnitId,
  className,
}: {
  /** `serial_units.id` — null/undefined skips the query (TSN-only match). */
  serialUnitId: number | null | undefined;
  className?: string;
}) {
  const id =
    typeof serialUnitId === 'number' && Number.isFinite(serialUnitId) && serialUnitId > 0
      ? serialUnitId
      : null;

  const query = useQuery(unitTimelinePhotosQuery(id));

  const groups = useMemo(
    () => groupOutbound(query.data?.photos ?? []),
    [query.data?.photos],
  );

  const galleryPhotos = useMemo<PhotoGalleryInput[]>(() => {
    const photos = query.data?.photos ?? [];
    return OUTBOUND_SOURCES.flatMap((source) =>
      photos
        .filter((p) => p.source === source)
        .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
        .map((p) => ({
          id: p.photoId,
          url: p.fullUrl,
          thumbUrl: p.thumbUrl,
        })),
    );
  }, [query.data?.photos]);

  const gallery = usePhotoGallery({ photos: galleryPhotos });

  const openPhoto = (photoId: number) => {
    const idx = galleryPhotos.findIndex(
      (p) => typeof p === 'object' && p.id === photoId,
    );
    gallery.openViewer(idx >= 0 ? idx : 0);
  };

  if (id == null) {
    return (
      <p
        className={cn('text-role-micro text-emerald-700/70', className)}
        data-testid="return-outbound-evidence-empty"
      >
        No unit photo spine for this match — open Full history for order events.
      </p>
    );
  }

  if (query.isLoading) {
    return (
      <div
        className={cn('flex items-center gap-1.5 text-role-micro text-emerald-700/70', className)}
        data-testid="return-outbound-evidence-loading"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Loading packer · tech photos…
      </div>
    );
  }

  if (query.isError) {
    return (
      <p
        className={cn('text-role-micro text-emerald-700/70', className)}
        data-testid="return-outbound-evidence-error"
      >
        Could not load outbound photos — open Full history to retry.
      </p>
    );
  }

  if (groups.length === 0) {
    return (
      <p
        className={cn('text-role-micro text-emerald-700/70', className)}
        data-testid="return-outbound-evidence-none"
      >
        No testing or packing photos on this unit.
      </p>
    );
  }

  return (
    <div
      className={cn('space-y-2', className)}
      data-testid="return-outbound-evidence-strip"
    >
      {groups.map(({ source, rows }) => (
        <StageThumbRow
          key={source}
          label={photoStageLabel(SOURCE_STAGE[source])}
          rows={rows}
          onOpen={openPhoto}
        />
      ))}
      {galleryPhotos.length > 0 ? <PhotoViewerPortal g={gallery} /> : null}
    </div>
  );
}
