'use client';

/** Publishes a `unit_photo_request` on `staffstation:{staffId}` so a phone loaded on the same staff id auto-navigates to the SERIAL_UNIT… */

import { useCallback } from 'react';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { markLocalUnitPhotoRequest } from '@/lib/realtime/unit-photo-request-local';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import type { useAblyClient } from '@/contexts/AblyContext';

type AblyGetClient = ReturnType<typeof useAblyClient>['getClient'];

interface UseUnitPhotoRequestPublisherArgs {
  staffIdNum: number;
  getAblyClient: AblyGetClient;
  /** `staffstation:{staffId}` channel name (`''` when org/staff unresolved). */
  stationChannelName: string;
}

type UnitPhotoRequestPublisher = (args: {
  /** Canonical serial_units.id — the phone uses it as the upload entityId. */
  serialUnitId: number;
  /** Resolvable unit key (serial or minted unit_uid) for display + poRef filing. */
  unitKey: string | null;
  /** `testing` (default), `prepack`, or later `packing` capture stage. */
  stage?: 'testing' | 'prepack' | 'packing';
  /** When packing, dual-link uploads to this packer_logs.id. */
  packerLogId?: number | null;
  /** Order / shipment ref for poRef. */
  poRef?: string | null;
  /** Caller-minted id (send-to-device ack waiter); minted here when omitted. */
  requestId?: string;
  /** What the phone should shoot (prepack serial / condition / contents). */
  aspect?: PhotoAspect | null;
}) => Promise<void>;

export function useUnitPhotoRequestPublisher({
  staffIdNum,
  getAblyClient,
  stationChannelName,
}: UseUnitPhotoRequestPublisherArgs): UnitPhotoRequestPublisher {
  return useCallback(
    async ({ serialUnitId, unitKey, stage = 'testing', packerLogId = null, poRef = null, requestId: givenRequestId, aspect = null }) => {
      if (!Number.isFinite(serialUnitId) || serialUnitId <= 0 || staffIdNum <= 0) return;
      if (!stationChannelName) return;
      try {
        const client = await getAblyClient();
        if (!client) return;
        const ch = client.channels.get(stationChannelName);
        const requestId = givenRequestId?.trim() || safeRandomUUID();
        markLocalUnitPhotoRequest(requestId);
        await ch.publish('unit_photo_request', {
          serial_unit_id: serialUnitId,
          unit_key: unitKey,
          stage,
          packer_log_id: packerLogId,
          po_ref: poRef,
          aspect,
          request_id: requestId,
          requested_by_staff_id: staffIdNum,
        });
      } catch (err) {
        console.warn('station: unit photo request publish failed', err);
      }
    },
    [getAblyClient, staffIdNum, stationChannelName],
  );
}
