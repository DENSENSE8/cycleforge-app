'use client';

/**
 * SKU exception — Photos: what the placeholder looks like, with the viewer
 * and delete. A fact of the record, so it leads the aside. Only when it HAS
 * photos; uploading is the item tile's own Upload / Phone (`StockPhotoTile`),
 * never an empty "No photo" tile here.
 */

import { useState } from 'react';
import Image from 'next/image';
import { Trash2 } from '@/components/Icons';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { deletePhoto } from '@/components/shipped/photo-gallery/photo-gallery-api';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

export function SkuExceptionPhotosSection({
  item,
  onChanged,
}: {
  item: ProvisionalSkuDetail;
  onChanged: () => Promise<void>;
}) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const gallery = usePhotoGallery({
    photos: item.photos.map((photo) => ({ id: photo.id, url: photo.url, thumbUrl: photo.thumbUrl })),
    onPhotoDeleted: () => void onChanged(),
  });

  const remove = async (photoId: number, url: string) => {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;
    setDeletingId(photoId);
    try {
      await deletePhoto(photoId, url);
      await onChanged();
      toast.success('Photo deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the photo.');
    } finally {
      setDeletingId(null);
    }
  };

  if (item.photos.length === 0) return null;

  return (
    <RecordGroup title={`Photos · ${item.photos.length}`} testId="sku-exception-photos">
      <ul className="grid grid-cols-4 gap-2 px-4 pb-3 pt-1">
        {item.photos.map((photo, index) => (
          <li key={photo.id}>
            <EvidencePhoto
              photo={photo}
              label={`Open photo ${index + 1} of ${item.photos.length}`}
              deleting={deletingId === photo.id}
              onOpen={() => gallery.openViewer(index)}
              onDelete={() => void remove(photo.id, photo.url)}
            />
          </li>
        ))}
      </ul>
      <PhotoViewerPortal g={gallery} />
    </RecordGroup>
  );
}

function EvidencePhoto({
  photo,
  label,
  deleting,
  onOpen,
  onDelete,
}: {
  photo: ProvisionalSkuDetail['photos'][number];
  label: string;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group/photo relative aspect-square overflow-hidden rounded-mode border border-mode-fact bg-mode-well">
      <button type="button" aria-label={label} onClick={onOpen} className={cn('absolute inset-0 cursor-zoom-in', focusRing('control'))}>
        <Image src={photo.thumbUrl} alt="" fill unoptimized sizes="96px" className="object-cover" />
      </button>
      <button
        type="button"
        aria-label={`Delete ${label.replace(/^Open /, '')}`}
        disabled={deleting}
        onClick={onDelete}
        className={cn(
          'ds-raw-button absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-mode bg-mode-panel text-mode-ink opacity-0 group-hover/photo:opacity-100 focus-visible:opacity-100',
          focusRing('control'),
        )}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
