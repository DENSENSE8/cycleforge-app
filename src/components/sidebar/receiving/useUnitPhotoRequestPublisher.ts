'use client';

/** Publishes a `unit_photo_request` on `staffstation:{staffId}` so a phone loaded on the same staff id auto-navigates to the SERIAL_UNIT… */

import { useCallback } from 'react';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { useAblyClient } from '@/contexts/AblyContext';

type AblyGetClient = ReturnType<typeof useAblyClient>['getClient'];

interface UseUnitPhotoRequestPublisherArgs {
  staffIdNum: number;
  getAblyClient: AblyGetClient;
  /** `staffstation:{staffId}` channel name (`''` when org/staff unresolved). */
  stationChannelName: string;
}

export type UnitPhotoRequestPublisher = (args: {
  /** Canonical serial_units.id — the phone uses it as the upload entityId. */
  serialUnitId: number;
  /** Resolvable unit key (serial or minted unit_uid) for display + poRef filing. */
  unitKey: string | null;
  /** `testing` (default) or `packing` — phone capture stage. */
  stage?: 'testing' | 'packing';
  /** When packing, dual-link uploads to this packer_logs.id. */
  packerLogId?: number | null;
  /** Order / shipment ref for poRef. */
  poRef?: string | null;
}) => Promise<void>;

export function useUnitPhotoRequestPublisher({
  staffIdNum,
  getAblyClient,
  stationChannelName,
}: UseUnitPhotoRequestPublisherArgs): UnitPhotoRequestPublisher {
  return useCallback(
    async ({ serialUnitId, unitKey, stage = 'testing', packerLogId = null, poRef = null }) => {
      if (!Number.isFinite(serialUnitId) || serialUnitId <= 0 || staffIdNum <= 0) return;
      if (!stationChannelName) return;
      try {
        const client = await getAblyClient();
        if (!client) return;
        const ch = client.channels.get(stationChannelName);
        await ch.publish('unit_photo_request', {
          serial_unit_id: serialUnitId,
          unit_key: unitKey,
          stage,
          packer_log_id: packerLogId,
          po_ref: poRef,
          request_id: safeRandomUUID(),
          requested_by_staff_id: staffIdNum,
        });
      } catch (err) {
        console.warn('station: unit photo request publish failed', err);
      }
    },
    [getAblyClient, staffIdNum, stationChannelName],
  );
}
