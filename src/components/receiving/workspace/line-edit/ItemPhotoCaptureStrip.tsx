'use client';

/**
 * Line-scoped item photo verbs — one SoT for dock Band 1 (`item_photos`) and
 * the PO-line capture row Photos expand:
 *   [ Link a photo | Upload photos | Send to phone ]
 *
 * Link opens the **Photos Displays → Link leaf** (`?photoAction=link`) in the
 * right rail — not a popover (a 32rem attach grid clipped off-screen from an
 * in-row anchor). The strip does not own `openDisplays`, so it emits
 * `receiving-open-photo-link`; LineEditPanel opens the leaf for this line.
 * Upload / phone stamp `unbox_item` + the receiving line id.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSendToDevice } from '@/components/station/send-to-device/useSendToDevice';
import { useSendToDeviceToast } from '@/components/station/send-to-device/useSendToDeviceToast';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { uploadPhotoClient } from '@/lib/photos/upload-client';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { resolveReceivingPhotoTarget } from '@/lib/receiving/photo-scope';
import {
  getReceivingPhotoRequestChannelName,
  publishReceivingPhotoRequest,
} from '@/lib/realtime/receiving-photo-request';
import { toast } from '@/lib/toast';
import { PhotoStepDockStrip } from './steps/dock/PhotoStepDockStrip';

function handFocusBack() {
  setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
}

export function ItemPhotoCaptureStrip({
  receivingId,
  lineId,
  staffId,
  poRef = null,
  poRouteRef = null,
  hostMarker = 'data-unbox-item-photos',
  emptyFallback = true,
}: {
  receivingId: number;
  lineId: number;
  staffId: number;
  poRef?: string | null;
  poRouteRef?: string | null;
  /** Host data attribute — dock vs capture row may differ for tests. */
  hostMarker?:
    | 'data-unbox-item-photos'
    | 'data-po-line-item-photos';
  /** Dock shows a caption when the target cannot resolve; capture may omit. */
  emptyFallback?: boolean;
}) {
  const queryClient = useQueryClient();
  const { getClient } = useAblyClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const phone = useSendToDevice('receiving_photo');
  useSendToDeviceToast(phone.state, phone.retry);
  const [uploading, setUploading] = useState(false);
  const staffNum = Number(staffId) || 0;
  const ackChannelName = getReceivingPhotoRequestChannelName(orgId, staffNum);
  const routeRef = String(poRouteRef ?? poRef ?? '').trim();

  const target = useMemo(() => {
    if (!receivingId || receivingId <= 0 || !lineId || lineId <= 0) return null;
    try {
      return resolveReceivingPhotoTarget({
        receivingId,
        receivingLineId: lineId,
        stage: 'unbox_item',
      });
    } catch {
      return null;
    }
  }, [receivingId, lineId]);

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
        handFocusBack();
      } finally {
        setUploading(false);
      }
    },
    [target, poRef, queryClient, receivingId],
  );

  const dz = usePhotoDropzone(handleFiles);

  const sendToPhone = useCallback(async () => {
    if (!orgId || staffNum <= 0) {
      toast.error('Sign in on your phone to take photos');
      return;
    }
    if (!routeRef) {
      toast.error('Link a PO to capture item photos on the phone');
      return;
    }
    if (!receivingId || receivingId <= 0 || lineId <= 0) {
      toast.error('No line to send to phone');
      return;
    }
    await phone.send({
      channelName: ackChannelName,
      publish: async (requestId) => {
        const client = await getClient();
        await publishReceivingPhotoRequest(client, orgId, staffNum, receivingId, {
          stage: 'unbox_item',
          receivingLineId: lineId,
          poRef: routeRef,
          requestId,
        });
      },
    });
    handFocusBack();
  }, [
    ackChannelName,
    getClient,
    lineId,
    orgId,
    phone,
    receivingId,
    routeRef,
    staffNum,
  ]);

  if (!target) {
    if (!emptyFallback) return null;
    return (
      <p className="truncate px-3 text-role-caption text-text-soft" data-unbox-item-photos>
        No item evidence to capture on this line.
      </p>
    );
  }

  return (
    <PhotoStepDockStrip
      hostMarker={hostMarker}
      rootProps={dz.rootProps}
      link={{
        onClick: () => {
          emitReceiving('receiving-open-photo-link', { lineId });
          handFocusBack();
        },
        ariaLabel: 'Link an existing carton photo to this line',
        label: 'Link a photo',
      }}
      upload={{
        onClick: () => dz.openPicker(),
        disabled: uploading,
        ariaLabel: uploading ? 'Uploading item photos' : 'Upload item photos',
        label: uploading ? 'Uploading…' : 'Upload photos',
      }}
      phone={{
        onClick: () => void sendToPhone(),
        disabled: phone.pending || !routeRef,
        ariaLabel: phone.pending ? 'Sending to phone…' : 'Send to phone',
        label: phone.pending ? 'Sending…' : 'Send to phone',
      }}
      fileInput={<input ref={dz.inputRef} {...dz.inputProps} />}
    />
  );
}
