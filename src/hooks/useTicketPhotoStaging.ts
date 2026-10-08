'use client';

import { useCallback, useMemo, useState } from 'react';
import { captureTimeFromFile } from '@/lib/photos/capture-time';
import { uploadPhotoClient, linkPhotoClient } from '@/lib/photos/upload-client';
import { TASK_MEDIA_ENTITY_TYPE } from '@/lib/tasks/task-links-shared';
import { toast } from '@/lib/toast';

/**
 * Where staged photos land: a helpdesk ticket's claim evidence, or a local
 * Support item's primary task media (the record's Media tab — the same photos
 * the composer's library reads under "This support item").
 */
export type TicketPhotoTarget = { kind: 'ticket'; ticketId: number } | { kind: 'support'; taskId: number };

/** Staged photos for a support ticket or Support item. */
export interface StagedPhoto {
  tempId: string;
  name: string;
  /** Local blob preview shown immediately (revoked on remove/clear). */
  previewUrl: string;
  status: 'uploading' | 'done' | 'error';
  /** Set once the GCS upload resolves. */
  photoId?: number;
  url?: string;
  thumbUrl?: string;
}

let seq = 0;

export function useTicketPhotoStaging(target: TicketPhotoTarget) {
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const support = target.kind === 'support';
  const entityId = support ? target.taskId : target.ticketId;
  // A ticket's photos are claim evidence; a Support item's are its task's primary media.
  const link = support
    ? ({ entityType: TASK_MEDIA_ENTITY_TYPE, linkRole: 'primary' } as const)
    : ({ entityType: 'ZENDESK_TICKET', linkRole: 'claim_evidence' } as const);

  const addFiles = useCallback(
    (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'));
      for (const file of images) {
        const tempId = `s-${(seq += 1)}`;
        const previewUrl = URL.createObjectURL(file);
        setStaged((prev) => [...prev, { tempId, name: file.name, previewUrl, status: 'uploading' }]);
        uploadPhotoClient({
          file,
          entityType: link.entityType,
          entityId,
          linkRole: link.linkRole,
          // The File's own timestamp travels with it rather than collapsing into
          // the server-insert instant. Null when it fails the shared bounds.
          clientCapturedAtMs: captureTimeFromFile(file),
        })
          .then((res) => {
            setStaged((prev) =>
              prev.map((s) =>
                s.tempId === tempId
                  ? { ...s, status: 'done', photoId: res.id, url: res.url, thumbUrl: res.thumbUrl }
                  : s,
              ),
            );
          })
          .catch((err) => {
            console.error('[ticket-photo-staging] upload failed', err);
            toast.error(`Couldn’t upload ${file.name}`);
            setStaged((prev) => prev.map((s) => (s.tempId === tempId ? { ...s, status: 'error' } : s)));
          });
      }
    },
    [link.entityType, link.linkRole, entityId],
  );

  /**
   * Stage existing library photos for the next reply. By default each is linked
   * to the target now; `{ link: false }` only stages them — for a host that has
   * not committed to a ticket yet (the send links them server-side).
   */
  const addLibraryPhotos = useCallback(
    (
      photos: { id: number; url: string; thumbUrl: string; caption?: string | null }[],
      opts: { link?: boolean } = {},
    ) => {
      const linkNow = opts.link ?? true;
      for (const photo of photos) {
        const tempId = `lib-${photo.id}`;
        setStaged((prev) => {
          if (prev.some((s) => s.photoId === photo.id)) return prev;
          return [
            ...prev,
            {
              tempId,
              name: photo.caption?.trim() || `Photo ${photo.id}`,
              previewUrl: photo.thumbUrl,
              status: linkNow ? ('uploading' as const) : ('done' as const),
              photoId: photo.id,
              url: photo.url,
              thumbUrl: photo.thumbUrl,
            },
          ];
        });
        if (!linkNow) continue;
        void linkPhotoClient({
          photoId: photo.id,
          entityType: link.entityType,
          entityId,
          linkRole: link.linkRole,
        })
          .then(() => {
            setStaged((prev) => prev.map((s) => (s.tempId === tempId ? { ...s, status: 'done' } : s)));
          })
          .catch((err) => {
            // Already linked to this target — still stage it.
            console.warn('[ticket-photo-staging] linkPhoto failed (may already be linked)', err);
            setStaged((prev) => prev.map((s) => (s.tempId === tempId ? { ...s, status: 'done' } : s)));
          });
      }
    },
    [link.entityType, link.linkRole, entityId],
  );

  const remove = useCallback((tempId: string) => {
    setStaged((prev) => {
      const target = prev.find((s) => s.tempId === tempId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.tempId !== tempId);
    });
  }, []);

  const clear = useCallback(() => {
    setStaged((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.previewUrl));
      return [];
    });
  }, []);

  const uploading = staged.some((s) => s.status === 'uploading');

  return useMemo(
    () => ({ staged, addFiles, addLibraryPhotos, remove, clear, uploading }),
    [staged, addFiles, addLibraryPhotos, remove, clear, uploading],
  );
}

export type TicketPhotoStaging = ReturnType<typeof useTicketPhotoStaging>;
