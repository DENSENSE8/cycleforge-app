'use client';

/**
 * Photos of one SKU exception: a thumb strip (tap → full-screen viewer, whose
 * two-tap delete removes the photo), plus the rear camera for more. Uploads
 * attach to the placeholder's `sku_stock` row, the same entity the create
 * sheet shoots against, and pairing carries them onto the real SKU.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { cornerClass } from '@/design-system/tokens/radius';
import {
  MobileSwipePhotoViewer,
  type SwipePhotoSlide,
} from '@/components/mobile/station/MobileSwipePhotoViewer';
import { invalidateSkuExceptions } from '@/hooks/useProvisionalSkus';
import { captureTimeFromFile } from '@/lib/photos/capture-time';
import { photoContentUrl } from '@/lib/photos/display-url';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { SkuExceptionSection } from './SkuExceptionSection';

export function SkuExceptionPhotos({ item }: { item: ProvisionalSkuDetail }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const slides: SwipePhotoSlide[] = useMemo(
    () =>
      item.photos.map((photo) => ({
        id: String(photo.id),
        previewUrl: photo.url || photoContentUrl(photo.id),
        deletable: true,
        uploadedBy: photo.takenByStaffId,
      })),
    [item.photos],
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading({ done: 0, total: files.length });
      let failed = 0;
      for (const [index, file] of files.entries()) {
        try {
          await uploadPhotoClient({
            file,
            entityType: 'SKU_STOCK',
            entityId: item.stockId,
            clientCapturedAtMs: captureTimeFromFile(file),
          });
        } catch {
          failed += 1;
        }
        setUploading({ done: index + 1, total: files.length });
      }
      setUploading(null);
      await invalidateSkuExceptions(queryClient, item.sku);
      if (failed > 0) toast.error(`${failed} of ${files.length} photos did not upload`);
      else toast.success(`${files.length} photo${files.length === 1 ? '' : 's'} added`);
    },
    [item.sku, item.stockId, queryClient],
  );

  const deletePhoto = useCallback(
    async (slide: SwipePhotoSlide) => {
      const res = await fetch(`/api/photos/${encodeURIComponent(slide.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        toast.error(`Could not delete photo (${res.status})`);
        return;
      }
      await invalidateSkuExceptions(queryClient, item.sku);
    },
    [item.sku, queryClient],
  );

  return (
    <SkuExceptionSection id="sku-exception-photos" heading={`Photos · ${item.photos.length}`}>
      <div className="flex flex-col gap-2 border-y border-border-hairline bg-surface-card px-3 py-3">
        {item.photos.length > 0 ? (
          <ul className="flex gap-2 overflow-x-auto">
            {item.photos.map((photo, index) => (
              <li key={photo.id} className="shrink-0">
                {/*
                  ds-raw-button: an image tile is not a Button shape; the
                  control-size guard would force a text-button height.
                */}
                <button
                  type="button"
                  aria-label={`View photo ${index + 1} of ${item.photos.length}`}
                  onClick={() => setViewerIndex(index)}
                  className={cn(
                    'ds-raw-button block h-20 w-20 overflow-hidden border border-border-hairline',
                    cornerClass('surface'),
                  )}
                >
                  <img
                    src={photo.thumbUrl || photoContentUrl(photo.id, 'thumb')}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-role-caption text-text-soft">No photos yet.</p>
        )}
        {/* A camera capture has no TextField shape; the Button below is its face. */}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'));
            event.target.value = '';
            void uploadFiles(files);
          }}
        />
        <Button
          variant="secondary"
          size="lg"
          radius="flush"
          icon={<Camera />}
          loading={uploading != null}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? `Uploading ${uploading.done}/${uploading.total}…` : 'Add photos'}
        </Button>
      </div>

      <MobileSwipePhotoViewer
        slides={slides}
        open={viewerIndex != null}
        initialIndex={viewerIndex ?? 0}
        presentation="sheet"
        onClose={() => setViewerIndex(null)}
        onDelete={deletePhoto}
      />
    </SkuExceptionSection>
  );
}
