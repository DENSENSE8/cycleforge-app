'use client';

/** Media Library desk header actions — overall Back up packer photos (NAS) + Download (shown window ZIP) + primary Add photos (entity-leaf upload). */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Archive, Download, Plus } from '@/components/Icons';
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

  const [backingUp, setBackingUp] = useState(false);
  // Packer photos → NAS `Shipping Packing Photos/<date packed>/<order | tracking>/`
  // through the Unbox archive agent. Batches until nothing is left or a batch stalls.
  const onBackupPacker = useCallback(async () => {
    setBackingUp(true);
    const toastId = toast.loading('Backing up packer photos to the NAS…');
    let copied = 0;
    try {
      for (;;) {
        const res = await fetch('/api/photos/packer-nas-backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const data = (await res.json().catch(() => null)) as {
          copied?: number;
          remaining?: number;
          error?: string | null;
          root?: string;
        } | null;
        if (!res.ok) throw new Error(data?.error || `Backup failed (${res.status})`);
        copied += data?.copied ?? 0;
        const remaining = data?.remaining ?? 0;
        if (remaining === 0) {
          toast.success(
            copied > 0
              ? `Backed up ${copied} packer photo${copied === 1 ? '' : 's'} to ${data?.root}`
              : 'Packer photos are already backed up',
            { id: toastId },
          );
          return;
        }
        if (!data?.copied) {
          throw new Error(
            `${data?.error || 'Backup stalled'} — ${copied} copied, ${remaining} left`,
          );
        }
        toast.loading(`Backed up ${copied} packer photos · ${remaining} left…`, { id: toastId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backup failed', { id: toastId });
    } finally {
      setBackingUp(false);
    }
  }, []);

  const backupControl = useMemo(
    () => (
      <DeskHeaderAction
        type="button"
        variant="secondary"
        size="sm"
        icon={<Archive aria-hidden />}
        onClick={() => void onBackupPacker()}
        disabled={backingUp}
        data-testid="photo-library-packer-nas-backup"
        ariaLabel="Back up packer photos to the NAS"
        title="Copy packer photos to USAV Media › Packing › Shipping Packing Photos, by date packed and order"
      >
        {backingUp ? 'Backing up…' : 'Back up packer photos'}
      </DeskHeaderAction>
    ),
    [backingUp, onBackupPacker],
  );

  const exportControl = useMemo(() => {
    const empty = shownCount === 0;
    // Download face — ZIP of the shown window. Empty stays visible and
    // disabled so the header CTA altitude is always present.
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
      <DeskActionSlotRegistrar role="overall">
        {backupControl}
        {exportControl}
      </DeskActionSlotRegistrar>
      <DeskActionSlotRegistrar role="primary">{addControl}</DeskActionSlotRegistrar>
    </>
  );
}
