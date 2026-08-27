'use client';

/**
 * Heavy Photos Actions tools — gallery viewer, native upload picker, Ably
 * phone publish. Mounted only after the first verb that needs them so the
 * default Actions face stays a light armed-row list.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyClient } from '@/contexts/AblyContext';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import type { PhotoGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import type { PhotoUploadTarget } from '@/components/shipped/photo-gallery/usePhotoGallery';
import {
  getReceivingPhotoRequestChannelName,
  publishReceivingPhotoRequest,
} from '@/lib/realtime/receiving-photo-request';
import { useSendToDevice } from '@/components/station/send-to-device/useSendToDevice';
import { useSendToDeviceToast } from '@/components/station/send-to-device/useSendToDeviceToast';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { toast } from '@/lib/toast';

export type PhotosHeavyVerb =
  | 'view'
  | 'phone'
  | 'upload'
  | 'download'
  | 'details';

export type PhotosToolStatus = {
  uploading: boolean;
  downloading: boolean;
  phonePending: boolean;
  canUpload: boolean;
  hasGalleryPhotos: boolean;
};

export function PhotosActionsToolRuntime({
  receivingId,
  staffId,
  photos,
  uploadTarget,
  libraryHref,
  poRouteRef,
  onOpenMove,
  onOpenSend,
  onPhotoDeleted,
  onPhotoReassigned,
  onPhotoUploaded,
  pendingVerb,
  onPendingConsumed,
  onStatusChange,
}: {
  receivingId: number;
  staffId: number;
  photos: PhotoGalleryInput[];
  uploadTarget: PhotoUploadTarget | undefined;
  libraryHref: string;
  poRouteRef: string | null;
  onOpenMove: () => void;
  onOpenSend: () => void;
  onPhotoDeleted: (photoId: number) => void;
  onPhotoReassigned: () => void;
  onPhotoUploaded: () => void;
  pendingVerb: PhotosHeavyVerb | null;
  onPendingConsumed: () => void;
  onStatusChange: (status: PhotosToolStatus) => void;
}) {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const { getClient } = useAblyClient();

  const g = usePhotoGallery({
    photos,
    orderId: `RCV-${receivingId}`,
    receivingId,
    uploadTarget,
    allowReassign: true,
    launcherLayout: 'toolbar',
    toolbarShowLabel: false,
    compact: true,
    libraryHref: libraryHref ?? undefined,
    onPhotoDeleted,
    onPhotoReassigned,
    onPhotoUploaded,
    onOpenMovePhotosExternal: onOpenMove,
    onSendToTicket: onOpenSend,
  });

  const dz = usePhotoDropzone(g.handleUploadFiles);

  const phone = useSendToDevice('receiving_photo');
  useSendToDeviceToast(phone.state, phone.retry);
  const ackChannelName = getReceivingPhotoRequestChannelName(orgId, staffId);
  const routeRef = String(poRouteRef ?? '').trim();

  const handleRequestOnPhone = useCallback(async () => {
    if (!orgId || staffId <= 0) {
      toast.error('Sign in on your phone to take photos');
      return;
    }
    await phone.send({
      channelName: ackChannelName,
      publish: async (requestId) => {
        const client = await getClient();
        await publishReceivingPhotoRequest(client, orgId, staffId, receivingId, {
          stage: 'unbox_carton',
          receivingLineId: null,
          poRef: routeRef || null,
          requestId,
        });
      },
    });
  }, [ackChannelName, getClient, orgId, phone, receivingId, routeRef, staffId]);

  useEffect(() => {
    onStatusChange({
      uploading: g.uploading,
      downloading: g.downloading,
      phonePending: phone.pending,
      canUpload: g.canUpload,
      hasGalleryPhotos: g.photoItems.length > 0,
    });
  }, [
    onStatusChange,
    g.uploading,
    g.downloading,
    g.canUpload,
    g.photoItems.length,
    phone.pending,
  ]);

  const openViewer = g.openViewer;
  const handleDownloadAll = g.handleDownloadAll;
  const openPicker = dz.openPicker;
  // Gate by verb id so parent callback identity churn cannot double-fire.
  const ranPendingRef = useRef<PhotosHeavyVerb | null>(null);

  useEffect(() => {
    if (!pendingVerb) {
      ranPendingRef.current = null;
      return;
    }
    if (ranPendingRef.current === pendingVerb) return;
    ranPendingRef.current = pendingVerb;
    switch (pendingVerb) {
      case 'view':
        openViewer(0);
        break;
      case 'details':
        openViewer(0, { details: true });
        break;
      case 'upload':
        openPicker();
        break;
      case 'download':
        void handleDownloadAll();
        break;
      case 'phone':
        void handleRequestOnPhone();
        break;
    }
    onPendingConsumed();
  }, [
    pendingVerb,
    openViewer,
    openPicker,
    handleDownloadAll,
    handleRequestOnPhone,
    onPendingConsumed,
  ]);

  return (
    <>
      {g.canUpload ? <input ref={dz.inputRef} {...dz.inputProps} /> : null}
      {g.photoItems.length > 0 ? <PhotoViewerPortal g={g} /> : null}
    </>
  );
}
