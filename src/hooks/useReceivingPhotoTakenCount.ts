'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import {
  getPhoneBridgeChannelName,
  safeChannelName,
} from '@/lib/realtime/channels';
import type { ReceivingPhotoTakenMessage } from '@/lib/receiving/photo-scope';

/**
 * Absolute in-flight shutter count for a carton from the phone bridge
 * (`receiving_photo_taken`). Taken event is SoT for placeholders; upload refresh
 * stays on {@link useReceivingPhotosRealtimeRefresh}.
 */
export function useReceivingPhotoTakenCount(
  receivingId: number | null | undefined,
  staffId: number,
  enabled = true,
): number {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const rid = Number(receivingId);
  const active = enabled && Number.isFinite(rid) && rid > 0 && staffId > 0 && !!orgId;

  const [inFlight, setInFlight] = useState(0);

  useEffect(() => {
    setInFlight(0);
  }, [rid]);

  const handleTaken = useCallback(
    (msg: { data?: ReceivingPhotoTakenMessage }) => {
      const incoming = Number(msg?.data?.receiving_id);
      if (!Number.isFinite(incoming) || incoming !== rid) return;
      const n = Math.max(0, Math.floor(Number(msg?.data?.in_flight) || 0));
      setInFlight(n);
    },
    [rid],
  );

  const phoneChannel = safeChannelName(() => getPhoneBridgeChannelName(orgId!, staffId));
  useAblyChannel(
    phoneChannel,
    'receiving_photo_taken',
    handleTaken,
    active && !!phoneChannel,
  );

  return active ? inFlight : 0;
}
