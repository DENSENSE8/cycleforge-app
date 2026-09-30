'use client';

/**
 * Desk → phone product-photo capture for one `sku_stock` row — the stock twin
 * of the receiving `ReceivingPhotoButton` send path. `send` asks this
 * staffer's signed-in phone to open `/m/stock/{stockId}/photos` over the
 * `staffstation:{staffId}` bridge and waits on the shared ack handshake; while
 * mounted the hook also repaints the record when a photo lands on that row
 * (`sku-stock-photo.changed` on the org station channel).
 */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { invalidateSkuExceptions } from '@/hooks/useProvisionalSkus';
import { useSendToDevice } from '@/components/station/send-to-device/useSendToDevice';
import { useSendToDeviceToast } from '@/components/station/send-to-device/useSendToDeviceToast';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import type { SendToDeviceState } from '@/lib/realtime/device-handshake';
import {
  SKU_STOCK_PHOTO_CHANGED_EVENT,
  getSkuStockPhotoRequestChannelName,
  publishSkuStockPhotoRequest,
} from '@/lib/realtime/sku-stock-photo-request';

const LABEL: Record<SendToDeviceState, string> = {
  idle: 'Send to phone',
  request_sent: 'Sending…',
  peer_active: 'Open on phone',
  timed_out: 'No phone answered',
};

/** `onChanged` — a surface that reads the SKU client-side re-reads it when a photo lands (`router.refresh` covers route loaders). */
export function useSkuStockSendToPhone(target: { stockId: number | null; sku: string; onChanged?: () => void }): {
  /** Ask this staffer's paired phone to open its camera for this SKU; null-safe no-op when stockId is null or no staff. */
  send: () => void;
  /** Face for the trigger, following the handshake state. */
  label: string;
  busy: boolean;
  /** False when there is no stock row / no staff / realtime unavailable. */
  available: boolean;
} {
  const { stockId, sku, onChanged } = target;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { getClient } = useAblyClient();
  const { user } = useAuth();
  const orgId = user?.organizationId ?? null;
  const staffId = user?.staffId ?? 0;
  const validStockId = stockId != null && Number.isFinite(stockId) && stockId > 0 ? stockId : null;

  const bridgeChannel = getSkuStockPhotoRequestChannelName(orgId, staffId);
  const available = validStockId != null && bridgeChannel.length > 0;

  const phone = useSendToDevice('stock_photo');
  useSendToDeviceToast(phone.state, phone.retry);
  const { send: sendToDevice, pending } = phone;

  const send = useCallback(() => {
    if (!available || validStockId == null || pending) return;
    void sendToDevice({
      channelName: bridgeChannel,
      // The minted id must reach the wire — the phone echoes it back as the ack.
      publish: async (requestId) => {
        const client = await getClient();
        await publishSkuStockPhotoRequest(client, orgId, staffId, validStockId, { sku, requestId });
      },
    });
  }, [available, bridgeChannel, getClient, orgId, pending, sendToDevice, sku, staffId, validStockId]);

  // Live repaint: the phone's upload (or any other surface's) lands on this row.
  const stationChannel = safeChannelName(() => getStationChannelName(orgId!));
  const onPhotoChanged = useCallback(
    (msg: { data?: { stock_id?: number } }) => {
      if (Number(msg?.data?.stock_id) !== validStockId) return;
      router.refresh();
      onChanged?.();
      void invalidateSkuExceptions(queryClient);
    },
    [onChanged, queryClient, router, validStockId],
  );
  useAblyChannel(
    stationChannel,
    SKU_STOCK_PHOTO_CHANGED_EVENT,
    onPhotoChanged,
    validStockId != null && !!stationChannel,
  );

  return { send, label: LABEL[phone.state], busy: pending, available };
}
