'use client';

/** Phone-paired scan bridge. */

import { isScanPreview } from '@/components/station/scan-bar';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import type { useAblyClient } from '@/contexts/AblyContext';
import type { TrackingScanState } from '@/components/sidebar/receiving/useTrackingScan';

type AblyGetClient = ReturnType<typeof useAblyClient>['getClient'];

interface UsePhoneScanBridgeArgs {
  phoneChannelName: string;
  stationChannelName: string;
  getAblyClient: AblyGetClient;
  staffId: string;
  submitTrackingScan: TrackingScanState['submitTrackingScan'];
}

export function usePhoneScanBridge({
  phoneChannelName,
  stationChannelName,
  getAblyClient,
  staffId,
  submitTrackingScan,
}: UsePhoneScanBridgeArgs): void {
  useAblyChannel(
    phoneChannelName,
    'phone_scan',
    (msg: { data?: { tracking?: string } }) => {
      const tracking = String(msg?.data?.tracking || '').trim();
      if (!tracking) return;
      if (isScanPreview()) return;
      submitTrackingScan(tracking, {
        onResult: async (result) => {
          try {
            if (!stationChannelName) return;
            const client = await getAblyClient();
            if (!client) return;
            const ch = client.channels.get(stationChannelName);
            await ch.publish('phone_scan_result', {
              tracking: result.tracking,
              matched: result.matched,
              po_ids: result.po_ids,
              receiving_id: result.receiving_id ?? null,
              exception_id: result.exception_id ?? null,
              exception_reason: result.exception_reason ?? null,
              error: result.error ?? null,
            });
          } catch (err) {
            console.warn('phone_scan_result publish failed', err);
          }
        },
      });
    },
    !!phoneChannelName && Number(staffId) > 0,
  );
}
