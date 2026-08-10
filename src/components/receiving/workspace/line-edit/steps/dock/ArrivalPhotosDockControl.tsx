'use client';

/**
 * Dock control for door photo steps — `arrival_label_photo` / `arrival_box_photo`.
 *
 * Band 1 right strip (left waist is {@link UnboxDockScanEntry}):
 *   [ Link a photo | Upload photos | Send to phone ]
 *
 * Stamps / claims `arrival_package` + the step's aspect — never `unbox_carton`.
 * Link opens {@link CartonPhotoPairPanel} in Arrival claim mode for that aspect.
 * After Check posts, this host toasts + advances the procedure pointer.
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
import { useUnboxProcedureSteps } from '../../useUnboxProcedureSteps';
import { PhotoStepDockStrip } from './PhotoStepDockStrip';
import type { UnboxStepDockContext } from './types';

function handFocusBack() {
  setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
}

function linkedToastCopy(aspect: UnboxStepDockContext['aspect']): string {
  if (aspect === 'shipping_label') return 'Label photo linked';
  if (aspect === 'box_exterior') return 'Box photo linked';
  return 'Door photo linked';
}

export function ArrivalPhotosDockControl({
  row,
  receivingId,
  staffId,
  aspect,
  poRef,
}: UnboxStepDockContext) {
  const queryClient = useQueryClient();
  const { getClient } = useAblyClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const phone = useSendToDevice('receiving_photo');
  useSendToDeviceToast(phone.state, phone.retry);
  const { nextNeighbour, focusStep } = useUnboxProcedureSteps(row);
  const [uploading, setUploading] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const linkRef = useRef<HTMLButtonElement>(null);
  const staffNum = Number(staffId) || 0;
  const ackChannelName = getReceivingPhotoRequestChannelName(orgId, staffNum);

  const aspectNoun = aspect ? photoAspectLabel(aspect).toLowerCase() : 'door photo';

  const target = useMemo(() => {
    if (!receivingId || receivingId <= 0) return null;
    try {
      return resolveReceivingPhotoTarget({
        receivingId,
        receivingLineId: null,
        stage: 'arrival_package',
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
          stage: 'arrival_package',
          receivingLineId: null,
          poRef: poRef ?? null,
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
    receivingId,
    staffNum,
  ]);

  const onLinked = useCallback(() => {
    setPairOpen(false);
    toast.success(linkedToastCopy(aspect));
    if (nextNeighbour) {
      focusStep(nextNeighbour.key);
    }
    handFocusBack();
  }, [aspect, focusStep, nextNeighbour]);

  return (
    <>
      <PhotoStepDockStrip
        hostMarker="data-unbox-arrival-photos-dock"
        rootProps={dz.rootProps}
        link={{
          onClick: () => setPairOpen((v) => !v),
          ariaLabel: `Link an existing ${aspectNoun}`,
          label: 'Link a photo',
          buttonRef: linkRef,
          buttonProps: {
            'aria-expanded': pairOpen,
            'data-unbox-arrival-link': true,
          },
        }}
        upload={{
          onClick: () => dz.openPicker(),
          disabled: !target || uploading,
          ariaLabel: uploading ? `Uploading ${aspectNoun}` : `Upload ${aspectNoun}`,
          label: uploading ? 'Uploading…' : 'Upload photos',
          buttonProps: { 'data-unbox-arrival-upload': true },
        }}
        phone={{
          onClick: () => void sendToPhone(),
          disabled: phone.pending || !receivingId,
          ariaLabel: phone.pending ? 'Sending to phone…' : 'Send to phone',
          label: phone.pending ? 'Sending…' : 'Send to phone',
          buttonProps: { 'data-unbox-arrival-phone': true },
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
        className="w-[32rem] max-w-[90vw] overflow-hidden p-0"
      >
        <CartonPhotoPairPanel
          receivingId={receivingId}
          aspect={aspect ?? null}
          stage="arrival_package"
          onPaired={onLinked}
        />
      </Popover>
    </>
  );
}
