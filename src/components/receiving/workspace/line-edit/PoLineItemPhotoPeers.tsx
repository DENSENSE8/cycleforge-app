'use client';

/**
 * Progressive Photos stage under an Unbox PO line — peer CTAs when expanded
 * (Upload from computer · Send to phone trailing), collapsed flush camera when
 * photos exist. Same write path as {@link ReceivingPhotoButton} / dock item
 * camera (`unbox_item` + line id).
 */

import { useCallback, useMemo, useState } from 'react';
import { Upload } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { useQueryClient } from '@tanstack/react-query';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { resolveReceivingPhotoTarget } from '@/lib/receiving/photo-scope';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { ReceivingPhotoButton } from './ReceivingPhotoButton';

export function PoLineItemPhotoPeers({
  receivingId,
  staffId,
  receivingLineId,
  poRef,
  poRouteRef,
  expanded,
  photoCount,
  onUploaded,
}: {
  receivingId: number;
  staffId: number;
  receivingLineId: number;
  poRef?: string | null;
  poRouteRef?: string | null;
  /** Full peer strip vs collapsed flush camera. */
  expanded: boolean;
  photoCount: number;
  onUploaded?: () => void;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const target = useMemo(() => {
    try {
      return resolveReceivingPhotoTarget({
        receivingId,
        receivingLineId,
        stage: 'unbox_item',
      });
    } catch {
      return null;
    }
  }, [receivingId, receivingLineId]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!target || files.length === 0) return;
      setUploading(true);
      try {
        for (const file of files) {
          await uploadPhotoClient({
            file,
            entityType: target.entityType,
            entityId: target.entityId,
            photoType: target.photoType ?? undefined,
            poRef: poRef ?? undefined,
          });
        }
        await queryClient.invalidateQueries({
          queryKey: ['receiving-photos', receivingId],
        });
        invalidateReceivingFeeds(queryClient);
        onUploaded?.();
      } finally {
        setUploading(false);
      }
    },
    [target, poRef, queryClient, receivingId, onUploaded],
  );

  const dz = usePhotoDropzone(handleFiles);

  const phone = (
    <ReceivingPhotoButton
      receivingId={receivingId}
      staffId={staffId}
      poRef={poRef ?? null}
      photoStage="unbox_item"
      receivingLineId={receivingLineId}
      poRouteRef={poRouteRef ?? null}
      galleryPlacement="above"
      appearance="flush"
      suppressHoverGallery={expanded}
    />
  );

  if (!expanded) {
    return (
      <div
        className="flex h-11 w-11 shrink-0 items-stretch [&>*]:h-full [&>*]:w-full"
        data-po-line-photo-stage="collapsed"
      >
        {phone}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-11 min-w-0 flex-1 items-stretch overflow-hidden divide-x divide-border-soft',
        cornerClass('flush'),
      )}
      data-po-line-photo-stage="expanded"
      {...dz.rootProps}
    >
      {/* ds-raw-button: peer Upload CTA on the progressive photos bar */}
      <button
        type="button"
        onClick={() => dz.openPicker()}
        disabled={!target || uploading}
        aria-label={uploading ? 'Uploading photos' : 'Upload from computer'}
        className={cn(
          'ds-raw-button inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 px-3',
          'text-role-caption font-semibold text-text-default transition-colors',
          'hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-text-faint',
          cornerClass('flush'),
        )}
      >
        <Upload className="h-4 w-4" aria-hidden />
        {uploading ? 'Uploading…' : 'Upload'}
      </button>
      <div className="flex h-11 w-11 shrink-0 items-stretch [&>*]:h-full [&>*]:w-full">
        {phone}
      </div>
      {target ? <input ref={dz.inputRef} {...dz.inputProps} /> : null}
      <span className="sr-only">
        {photoCount > 0 ? `${photoCount} item photos` : 'No item photos yet'}
      </span>
    </div>
  );
}
