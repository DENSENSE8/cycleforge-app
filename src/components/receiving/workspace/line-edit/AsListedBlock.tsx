'use client';

/**
 * Desktop unbox "As listed" — what the purchase listing showed for the line
 * being unboxed, above the return callout in LineEditPanel: the listing
 * photos (the shared photo viewer, opened at that photo and paging across
 * every listing photo), the grade it was bought as (`purchase_condition_grade`)
 * and the listing serials with their confirm state. The phone carton record
 * paints the same facts in `MobileV2AsListedSection` (surfaces never share
 * rendered components — ARCHITECTURE.md "Component split"). Renders nothing
 * when the listing said nothing.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { receivingSiblingsQueryKey, type ReceivingSiblingsCache } from '@/lib/queries/receiving-queries';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { cornerClass } from '@/design-system/tokens/radius';
import { conditionLabel } from '@/lib/conditions';
import { photoContentUrl } from '@/lib/photos/display-url';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { cn } from '@/utils/_cn';

type ListingFacts = Pick<ReceivingLineRow, 'id' | 'receiving_id' | 'purchase_condition_grade' | 'listing_serials' | 'listing_photo_ids'>;

export function AsListedBlock({
  line,
  className,
}: {
  line: ListingFacts;
  className?: string;
}) {
  // The workspace row can be a scan's optimistic stub without listing facts; the
  // carton's sibling cache (hydrated by `usePoLinesData`) holds the real line.
  // Read-only subscription — this block never fetches.
  const queryClient = useQueryClient();
  const receivingId = Number(line.receiving_id ?? 0);
  const subscribe = useCallback((onChange: () => void) => queryClient.getQueryCache().subscribe(onChange), [queryClient]);
  const siblings = useSyncExternalStore(
    subscribe,
    () => queryClient.getQueryData<ReceivingSiblingsCache<ListingFacts>>(receivingSiblingsQueryKey(receivingId)),
    () => undefined,
  );
  const hydrated = siblings?.receiving_lines.find((r) => r.id === line.id);
  const facts = hydrated?.listing_serials !== undefined ? hydrated : line;
  const photoIds = facts.listing_photo_ids;
  const serials = facts.listing_serials ?? [];
  const grade = (facts.purchase_condition_grade ?? '').trim();

  // Read-only inputs (no photo id): listing evidence is managed on the purchase order, never deleted from unbox.
  const photos = useMemo(
    () => (photoIds ?? []).map((id) => ({ url: photoContentUrl(id), thumbUrl: photoContentUrl(id, 'thumb') })),
    [photoIds],
  );
  const gallery = usePhotoGallery({ photos });

  if (!grade && photos.length === 0 && serials.length === 0) return null;

  return (
    <RecordGroup title="As listed" testId="as-listed-block" className={className}>
      <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
        {photos.length > 0 ? (
          <EvidenceFactRow label="Photos">
            <ul className="flex flex-wrap gap-1.5 py-1.5" aria-label="Listing photos">
              {photos.map((p, index) => (
                <li key={p.url}>
                  <PhotoHoverPeek
                    src={p.thumbUrl}
                    fullSrc={p.url}
                    alt={`Listing photo ${index + 1}`}
                    onOpen={() => gallery.openViewer(index)}
                    className={cn('block size-12 overflow-hidden ring-1 ring-inset ring-border-soft', cornerClass('row'))}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- photo content route */}
                    <img src={p.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
                  </PhotoHoverPeek>
                </li>
              ))}
            </ul>
          </EvidenceFactRow>
        ) : null}
        {grade ? <EvidenceFactRow label="Bought as">{conditionLabel(grade, 'full')}</EvidenceFactRow> : null}
        {serials.length > 0 ? (
          <EvidenceFactRow label={serials.length === 1 ? 'Serial' : 'Serials'}>
            <ul className="flex flex-col py-1" aria-label="Listing serials">
              {serials.map((s) => (
                <li key={s.id} className="flex min-w-0 items-baseline gap-2">
                  <span className={cn(RECORD_ID_CLASS, 'min-w-0 break-all')}>{s.serial}</span>
                  <span className={cn('shrink-0 text-role-caption', s.confirmed_at ? 'text-text-success' : 'text-text-warning')}>
                    {s.confirmed_at ? 'Confirmed' : 'To confirm'}
                  </span>
                </li>
              ))}
            </ul>
          </EvidenceFactRow>
        ) : null}
      </div>
      {photos.length > 0 ? <PhotoViewerPortal g={gallery} /> : null}
    </RecordGroup>
  );
}
