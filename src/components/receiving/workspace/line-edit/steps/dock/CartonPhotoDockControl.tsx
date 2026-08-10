'use client';

/**
 * Dock control for the three bench carton shots — `shipping_label_photo`,
 * `box_photo` and `packing_material`.
 *
 * Band 1 right strip (left waist is {@link UnboxDockScanEntry}):
 *   [ Link a photo | Upload photos | Send to phone ]
 *
 * Link opens {@link CartonPhotoPairPanel} (`unbox_carton` + step aspect).
 * Upload / phone stamp the same stage + aspect via the photo-scope SoT.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { Popover } from '@/design-system/primitives';
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
import { photoAspectLabel } from '@/lib/photos/photo-aspects';
import { toast } from '@/lib/toast';
import { CartonPhotoPairPanel } from '../CartonPhotoPairPanel';
import { PhotoStepDockStrip } from './PhotoStepDockStrip';
import type { UnboxStepDockContext } from './types';

function handFocusBack() {
  setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
}

export function CartonPhotoDockControl({
  receivingId,
  staffId,
  aspect,
  poRef,
  poRouteRef,
}: UnboxStepDockContext) {
  const queryClient = useQueryClient();
  const { getClient } = useAblyClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const phone = useSendToDevice('receiving_photo');
  useSendToDeviceToast(phone.state, phone.retry);
  const [uploading, setUploading] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const linkRef = useRef<HTMLButtonElement>(null);
  const staffNum = Number(staffId) || 0;
  const ackChannelName = getReceivingPhotoRequestChannelName(orgId, staffNum);

  const target = useMemo(() => {
    if (!receivingId || receivingId <= 0) return null;
    try {
      return resolveReceivingPhotoTarget({
        receivingId,
        receivingLineId: null,
        stage: 'unbox_carton',
        aspect: aspect ?? null,
      });
    } catch {
      return null;
    }
  }, [receivingId, aspect]);

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
            photoAspect: target.aspect ?? undefined,
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
    if (!receivingId || receivingId <= 0) {
      toast.error('No carton to send to phone');
      return;
    }
    await phone.send({
      channelName: ackChannelName,
      publish: async (requestId) => {
        const client = await getClient();
        await publishReceivingPhotoRequest(client, orgId, staffNum, receivingId, {
          stage: 'unbox_carton',
          receivingLineId: null,
          poRef: (poRouteRef ?? poRef) ?? null,
          requestId,
        });
      },
    });
    handFocusBack();
  }, [
    ackChannelName,
    getClient,
    orgId,
    phone,
    poRef,
    poRouteRef,
    receivingId,
    staffNum,
  ]);

  return (
    <>
      <PhotoStepDockStrip
        hostMarker="data-unbox-carton-photo-dock"
        rootProps={dz.rootProps}
        link={{
          onClick: () => setPairOpen((v) => !v),
          ariaLabel: aspect
            ? `Link an existing photo of the ${photoAspectLabel(aspect).toLowerCase()}`
            : 'Link an existing carton photo',
          label: 'Link a photo',
          buttonRef: linkRef,
          buttonProps: { 'aria-expanded': pairOpen },
        }}
        upload={{
          onClick: () => dz.openPicker(),
          disabled: !target || uploading,
          ariaLabel: uploading ? 'Uploading carton photos' : 'Upload carton photos',
          label: uploading ? 'Uploading…' : 'Upload photos',
        }}
        phone={{
          onClick: () => void sendToPhone(),
          disabled: phone.pending || !receivingId,
          ariaLabel: phone.pending ? 'Sending to phone…' : 'Send to phone',
          label: phone.pending ? 'Sending…' : 'Send to phone',
        }}
        fileInput={target ? <input ref={dz.inputRef} {...dz.inputProps} /> : null}
      />
      <Popover
        open={pairOpen}
        onClose={() => {
          setPairOpen(false);
          handFocusBack();
        }}
        anchorRef={linkRef}
        placement="top-end"
        className="w-[22rem] max-w-[90vw]"
      >
        <CartonPhotoPairPanel
          receivingId={receivingId}
          aspect={aspect ?? null}
          stage="unbox_carton"
          onPaired={() => {
            setPairOpen(false);
            handFocusBack();
          }}
        />
      </Popover>
    </>
  );
}
