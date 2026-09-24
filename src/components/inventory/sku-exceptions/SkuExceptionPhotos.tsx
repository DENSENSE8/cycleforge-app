'use client';

/**
 * Photos section — what the placeholder looks like. Thumbnails open the shared
 * lightbox; Add photos uploads each picked file as a `SKU_STOCK` photo on the
 * placeholder's `sku_stock` row (the same entity the phone attaches to, and the
 * one a pair carries onto the real SKU).
 */

import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { deletePhoto } from '@/components/shipped/photo-gallery/photo-gallery-api';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

export function SkuExceptionPhotos({
  item,
  onChanged,
}: {
  item: ProvisionalSkuDetail;
  onChanged: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
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

  return (
    <div className="space-y-4">
      {item.photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5" data-testid="sku-exception-photos">
          {item.photos.map((photo, index) => (
            <li key={photo.id} className="group relative aspect-square">
              <button
                type="button"
                onClick={() => gallery.openViewer(index)}
                aria-label={`Open photo ${index + 1} of ${item.photos.length}`}
                className={cn(
                  'h-full w-full overflow-hidden border border-border-soft bg-surface-sunken',
                  focusRing('control'),
                  cornerClass('surface'),
                )}
              >
                <img src={photo.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
              <IconButton
                size="sm"
                tone="glass"
                ariaLabel={`Delete photo ${index + 1}`}
                disabled={deletingId === photo.id}
                onClick={() => void remove(photo.id, photo.url)}
                className="absolute right-1 top-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                icon={<Trash2 />}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-role-caption text-text-soft">
          No photos yet — a photo is what lets a colleague recognise the product to pair it.
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {uploading ? (
          <span role="status" className="mr-auto text-role-caption text-text-soft tabular-nums">
            Uploading {uploading.done}/{uploading.total}…
          </span>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            void upload(files);
          }}
          data-testid="sku-exception-photo-input"
        />
        <Button
          variant="secondary"
          size="sm"
          icon={<ImagePlus />}
          loading={uploading !== null}
          onClick={() => fileRef.current?.click()}
        >
          Add photos
        </Button>
      </div>
      <PhotoViewerPortal g={gallery} />
    </div>
  );
}
