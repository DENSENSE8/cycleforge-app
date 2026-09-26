'use client';

/** Publishes a `receiving_photo_request` on `staffstation:{staffId}` so a phone loaded on the same staff id auto-navigates to the photo… */

import { useCallback } from 'react';
import { randomId } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { buildReceivingPhotoRequestPayload } from '@/lib/realtime/receiving-photo-request';
import type { ReceivingPhotoStage } from '@/lib/receiving/photo-intent';
import type { useAblyClient } from '@/contexts/AblyContext';

type AblyGetClient = ReturnType<typeof useAblyClient>['getClient'];

interface UsePhotoRequestPublisherArgs {
  staffIdNum: number;
  getAblyClient: AblyGetClient;
  /** `staffstation:{staffId}` channel name (`''` when org/staff unresolved). */
  stationChannelName: string;
}

export type PhotoRequestPublisher = (
  receivingId: number,
  tracking: string,
  stage: ReceivingPhotoStage,
) => Promise<void>;

export function usePhotoRequestPublisher({
  staffIdNum,
  getAblyClient,
  stationChannelName,
}: UsePhotoRequestPublisherArgs): PhotoRequestPublisher {
  return useCallback(
    async (receivingId: number, tracking: string, stage: ReceivingPhotoStage) => {
      if (!Number.isFinite(receivingId) || receivingId <= 0 || staffIdNum <= 0) return;
      if (!stationChannelName) return;
      try {
        const client = await getAblyClient();
        if (!client) return;
        const ch = client.channels.get(stationChannelName);
        // Surface-aware stage (caller-supplied). Same v2 payload shape as the
        // station Photo pills — stage + optional tracking.
        await ch.publish(
          'receiving_photo_request',
          buildReceivingPhotoRequestPayload(receivingId, staffIdNum, {
            stage,
            tracking,
            requestId: randomId(),
          }),
        );
      } catch (err) {
        console.warn('receiving-sidebar: photo request publish failed', err);
      }
    },
    [getAblyClient, staffIdNum, stationChannelName],
  );
}
