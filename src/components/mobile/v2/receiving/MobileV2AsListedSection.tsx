'use client';

/**
 * Phone "As listed" for one carton line (`/m/r/[id]` line sheet) — the same
 * facts desktop unbox paints in `AsListedBlock`: listing photos (tap → swipe
 * viewer at that photo, paging across every listing photo), the grade the
 * item was bought as and the listing serials with their confirm state.
 * Read-only: the sheet has no serial capture, so confirming happens where the
 * serial is added. Renders nothing when the listing said nothing.
 */

import { useMemo, useState } from 'react';
import { MobileSwipePhotoViewer, type SwipePhotoSlide } from '@/components/mobile/station/MobileSwipePhotoViewer';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { conditionLabel } from '@/lib/conditions';
import { photoContentUrl } from '@/lib/photos/display-url';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { cn } from '@/utils/_cn';

export function MobileV2AsListedSection({
  line,
}: {
  line: Pick<ReceivingLineRow, 'purchase_condition_grade' | 'listing_serials' | 'listing_photo_ids'>;
}) {
  const photoIds = line.listing_photo_ids;
  const serials = line.listing_serials ?? [];
  const grade = (line.purchase_condition_grade ?? '').trim();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Read-only slides: listing evidence is managed on the purchase order, never deleted from the phone record.
  const slides = useMemo<SwipePhotoSlide[]>(
    () => (photoIds ?? []).map((id) => ({ id: String(id), previewUrl: photoContentUrl(id), deletable: false })),
    [photoIds],
  );

  if (!grade && slides.length === 0 && serials.length === 0) return null;

  return (
    <section aria-label="As listed" className="border border-border-soft bg-surface-card" data-testid="mobile-as-listed">
      <h3 className="border-b border-border-soft px-3 py-2 text-sm font-semibold text-text-default">As listed</h3>
      {slides.length > 0 ? (
        <ul className="flex gap-2 overflow-x-auto border-b border-border-soft p-3" aria-label="Listing photos">
          {(photoIds ?? []).map((id, index) => (
            <li key={id} className="shrink-0">
              <PhotoHoverPeek
                src={photoContentUrl(id, 'thumb')}
                fullSrc={photoContentUrl(id)}
                alt={`Listing photo ${index + 1}`}
                onOpen={() => setViewerIndex(index)}
                className="block size-16 overflow-hidden bg-surface-sunken"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- photo content route */}
                <img src={photoContentUrl(id, 'thumb')} alt="" loading="lazy" className="size-full object-cover" />
              </PhotoHoverPeek>
            </li>
          ))}
        </ul>
      ) : null}
      {grade ? (
        <p className="flex min-h-11 items-center justify-between gap-3 border-b border-border-soft px-3 last:border-b-0">
          <span className="text-xs text-text-muted">Bought as</span>
          <span className="text-sm font-semibold text-text-default">{conditionLabel(grade, 'full')}</span>
        </p>
      ) : null}
      {serials.length > 0 ? (
        <ul aria-label="Listing serials">
          {serials.map((s) => (
            <li key={s.id} className="flex min-h-11 items-center justify-between gap-3 border-b border-border-soft px-3 last:border-b-0">
              <span className={cn(RECORD_ID_CLASS, 'min-w-0 break-all text-text-default')}>{s.serial}</span>
              <span className={cn('shrink-0 text-xs font-semibold', s.confirmed_at ? 'text-text-success' : 'text-text-warning')}>
                {s.confirmed_at ? 'Confirmed' : 'To confirm'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <MobileSwipePhotoViewer
        presentation="sheet"
        open={viewerIndex != null}
        initialIndex={viewerIndex ?? 0}
        slides={slides}
        onClose={() => setViewerIndex(null)}
      />
    </section>
  );
}
