'use client';

import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';

/** Invalidate packer-photo queries when uploads land via the station channel (`packer-photo.changed`, published by /api/photos/upload and… */
export function usePackerPhotosRealtimeRefresh(
  packerLogId: number | null | undefined,
  onRefresh: () => void,
  enabled = true,
): void {
  const { user } = useAuth();
  const orgId = user?.organizationId;

  const handleMessage = useCallback(
    (msg: { data?: { packer_log_id?: number } }) => {
      if (packerLogId != null) {
        const incoming = Number(msg?.data?.packer_log_id);
        if (!Number.isFinite(incoming) || incoming !== Number(packerLogId)) return;
      }
      onRefresh();
    },
    [packerLogId, onRefresh],
  );

  const stationChannel = safeChannelName(() => getStationChannelName(orgId!));
  useAblyChannel(
    stationChannel,
    'packer-photo.changed',
    handleMessage,
    enabled && !!stationChannel,
  );
}
