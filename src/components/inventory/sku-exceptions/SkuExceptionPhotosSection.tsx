'use client';

/**
 * SKU exception evidence — Photos: what the placeholder looks like. Uploads,
 * deletes and the viewer; every write then `onChanged` (→ invalidate), so the
 * phone and this desk repaint each other.
 */

import { useState, type MutableRefObject } from 'react';
import Image from 'next/image';
import { Trash2 } from '@/components/Icons';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { deletePhoto } from '@/components/shipped/photo-gallery/photo-gallery-api';
import { EvidenceSection, evidenceVerbClass } from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** What the placeholder looks like: */
export function SkuExceptionPhotosSection({
  item,
  onChanged,
  fileRef,
}: {
  item: ProvisionalSkuDetail;
  onChanged: () => Promise<void>;
  /** The hidden file input — the decision bar's Add photo presses it too. */
  fileRef: MutableRefObject<HTMLInputElement | null>;
}) {
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const gallery = usePhotoGallery({
    photos: item.photos.map((photo) => ({ id: photo.id, url: photo.url, thumbUrl: photo.thumbUrl })),
    onPhotoDeleted: () => void onChanged(),
  });

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    let failed = 0;
    setUploading({ done: 0, total: files.length });
    for (const [index, file] of files.entries()) {
      try {
        await uploadPhotoClient({ file, entityType: 'SKU_STOCK', entityId: item.stockId });
      } catch (err) {
        failed += 1;
        toast.error(err instanceof Error ? err.message : `Could not upload ${file.name}`);
      }
      setUploading({ done: index + 1, total: files.length });
    }
    setUploading(null);
    await onChanged();
    const added = files.length - failed;
    if (added > 0) toast.success(`Added ${added} photo${added === 1 ? '' : 's'}`);
  };

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

  const hasPhotos = item.photos.length > 0;

  return (
    <EvidenceSection
      label={`Photos · ${item.photos.length}`}
      testId="sku-exception-photos"
      action={
        <button
          type="button"
          className={cn(evidenceVerbClass(false), 'min-h-0 py-1')}
          disabled={uploading !== null}
          onClick={() => fileRef.current?.click()}
          data-testid="sku-exception-add-photos"
        >
          {uploading ? `Uploading ${uploading.done}/${uploading.total}` : 'Add photos'}
        </button>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void upload(files);
        }}
        data-testid="sku-exception-photo-input"
      />
      {hasPhotos ? (
        <ul className="grid grid-cols-4 gap-2">
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
      ) : (
        <button
          type="button"
          data-testid="sku-exception-photo-empty"
          onClick={() => fileRef.current?.click()}
          className={cn(
            'flex h-14 w-full items-center justify-center gap-2 rounded-mode border border-dashed border-mode-control bg-mode-well px-3',
            focusRing('control'),
          )}
        >
          <span className={cn(RECORD_LABEL_CLASS, 'text-mode-warn')}>No photo</span>
          <span className="text-role-data text-mode-muted">Add one to help a colleague pair it.</span>
        </button>
      )}
      <PhotoViewerPortal g={gallery} />
    </EvidenceSection>
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
    <div className="group/photo relative aspect-square overflow-hidden rounded-mode border border-mode-rule bg-mode-well">
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
