'use client';

/** Media Library desk header actions — overall Download (shown window ZIP) + primary Add photos (entity-leaf upload). */

import { useCallback, useMemo, useRef } from 'react';
import { Download, Plus } from '@/components/Icons';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import { captureTimeFromFile } from '@/lib/photos/capture-time';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import type { PhotoEntityType, PhotoLinkRole } from '@/lib/photos/types';
import { toast } from '@/lib/toast';
import { triggerBrowserDownload, buildPhotoZipDownloadUrl } from '@/lib/photos/download-zip';

export type MediaUploadTarget = {
  entityType: PhotoEntityType;
  entityId: number;
  photoType?: string | null;
  poRef?: string | null;
  linkRole?: PhotoLinkRole;
};

export function PhotoLibraryDeskActions({
  shownIds,
  shownCount,
  exportTitle,
  uploadTarget,
  onUploaded,
}: {
  /** Photo ids currently loaded in the stream (Export scope = shown). */
  shownIds: readonly number[];
  shownCount: number;
  exportTitle: string;
  /** Null when no carton/ticket leaf — Add stays visible and disabled. */
  uploadTarget: MediaUploadTarget | null;
  onUploaded: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onExport = useCallback(() => {
    if (shownIds.length === 0) return;
    const url = buildPhotoZipDownloadUrl([...shownIds], exportTitle);
    if (!url) {
      toast.error('Nothing to export');
      return;
    }
    triggerBrowserDownload(url);
    toast.success(
      `Preparing ZIP of ${shownIds.length} photo${shownIds.length === 1 ? '' : 's'}…`,
    );
  }, [exportTitle, shownIds]);

  const onPickFiles = useCallback(
    async (files: FileList | null) => {
      if (!uploadTarget || !files || files.length === 0) return;
      const images = [...files].filter((f) => f.type.startsWith('image/'));
      if (images.length === 0) {
        toast.error('Pick image files to upload');
        return;
      }
      const toastId = toast.loading(
        `Uploading ${images.length} photo${images.length === 1 ? '' : 's'}…`,
      );
      let ok = 0;
      let failed = 0;
      for (const file of images) {
        try {
          await uploadPhotoClient({
            file,
            entityType: uploadTarget.entityType,
            entityId: uploadTarget.entityId,
            photoType: uploadTarget.photoType ?? undefined,
            poRef: uploadTarget.poRef ?? undefined,
            linkRole: uploadTarget.linkRole,
            clientCapturedAtMs: captureTimeFromFile(file),
          });
          ok++;
        } catch (err) {
          failed++;
          console.error('[photo-library-upload]', err);
        }
      }
      if (ok > 0) {
        toast.success(`Uploaded ${ok} photo${ok === 1 ? '' : 's'}`, { id: toastId });
        onUploaded();
      } else {
        toast.error('Upload failed', { id: toastId });
      }
      if (failed > 0 && ok > 0) {
        toast.error(`${failed} file${failed === 1 ? '' : 's'} failed`);
      }
      if (fileRef.current) fileRef.current.value = '';
    },
    [onUploaded, uploadTarget],
  );

  const exportControl = useMemo(() => {
    const empty = shownCount === 0;
    // Download face — ZIP of the shown window (never library/ids). Empty stays
    // visible and disabled so the header CTA altitude is always present.
    const label = empty ? 'Download' : `Download ${shownCount}`;
    return (
      <DeskHeaderAction
        type="button"
        variant="secondary"
        size="sm"
        icon={<Download aria-hidden />}
        onClick={onExport}
        disabled={empty}
        data-testid="photo-library-export"
        ariaLabel={empty ? 'Download ZIP of photos in view' : `Download ZIP of ${shownCount} in view`}
        title={empty ? 'Nothing in view to download' : `Download ZIP of ${shownCount} in view`}
      >
        {label}
      </DeskHeaderAction>
    );
  }, [onExport, shownCount]);

  const addControl = useMemo(() => {
    const armed = uploadTarget != null;
    return (
      <>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          data-testid="photo-library-upload-input"
          onChange={(e) => void onPickFiles(e.target.files)}
        />
        <DeskHeaderAction
          type="button"
          variant="primary"
          size="sm"
          icon={<Plus aria-hidden />}
          disabled={!armed}
          onClick={() => {
            if (!armed) {
              toast.error('Find an order, carton, or ticket first');
              return;
            }
            fileRef.current?.click();
          }}
          data-testid="photo-library-add-photos"
          ariaLabel={armed ? 'Add photos' : 'Add photos — find a carton or ticket first'}
          title={armed ? 'Add photos to this folder' : 'Find a carton or ticket first'}
        >
          Add photos
        </DeskHeaderAction>
      </>
    );
  }, [onPickFiles, uploadTarget]);

  return (
    <>
      <DeskActionSlotRegistrar role="overall">{exportControl}</DeskActionSlotRegistrar>
      <DeskActionSlotRegistrar role="primary">{addControl}</DeskActionSlotRegistrar>
    </>
  );
}
