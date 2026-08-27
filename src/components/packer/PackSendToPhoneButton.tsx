'use client';

/**
 * Manual "send to phone" for the pack identity bar — the packing sibling of the
 * Unbox carton photo pill ({@link ReceivingPhotoButton}).
 *
 * /api/packing-logs already opens the packer's phone automatically on a tracking
 * pack (server `publishPackerScanReady`). This is the operator's re-send: phone
 * locked, wrong phone, camera closed, or a second round of photos. It publishes
 * the SAME `scan_ready` event on the same `packer:{staffId}` bridge, so the phone
 * listener ({@link PackerScanReadyCamera}) needs no new branch — only a fresh
 * `requestId`, which defeats its "already handled this log" dedupe so a manual
 * re-send always lands.
 *
 * Mount via {@link CartonContextCard} `photosCell` — same chrome face as Unbox
 * Photos (`STATION_CONTEXT_PHOTO_CHROME_CLASS`), never a sibling beside the card.
 */

import { useCallback } from 'react';
import { Camera } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { STATION_CONTEXT_PHOTO_CHROME_CLASS } from '@/components/station/entity-context/station-context-action-pill';
import { STATION_CHROME_GLYPH_CLASS } from '@/components/station/entity-context/station-identity-chrome';
import { useSendToDevice } from '@/components/station/send-to-device/useSendToDevice';
import { useSendToDeviceToast } from '@/components/station/send-to-device/useSendToDeviceToast';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { safeChannelName, getPackerBridgeChannelName } from '@/lib/realtime/channels';
import { useScopedPackerPhotos } from '@/hooks/useScopedPackerPhotos';
import { usePackerPhotosRealtimeRefresh } from '@/hooks/usePackerPhotosRealtimeRefresh';
import { toast } from '@/lib/toast';

export function PackSendToPhoneButton({
  packerLogId,
  orderId,
  tracking,
}: {
  /** packer_logs.id the phone uploads against (`/m/p/{id}/photos`). */
  packerLogId: number;
  orderId?: string | null;
  tracking?: string | null;
}) {
  const { getClient } = useAblyClient();
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const staffId = user?.staffId ?? 0;
  const channelName = safeChannelName(() => getPackerBridgeChannelName(orgId!, staffId));

  const { query } = useScopedPackerPhotos(packerLogId);
  usePackerPhotosRealtimeRefresh(packerLogId, () => void query.refetch());
  const count = query.data?.photos?.length ?? 0;

  // Same handshake and same toast as the Unbox carton pill (P1 · D2):
  // `scan_ready` used to publish blind, so a locked phone was indistinguishable
  // from a delivered request.
  const phone = useSendToDevice('pack_scan');
  useSendToDeviceToast(phone.state, phone.retry);

  const handleSend = useCallback(async () => {
    if (!channelName || staffId <= 0) {
      toast.error('Sign in on your phone to take photos');
      return;
    }
    await phone.send({
      channelName,
      publish: async (requestId) => {
        const client = await getClient();
        if (!client) throw new Error('No realtime client');
        await client.channels.get(channelName).publish('scan_ready', {
          type: 'packer.scan_ready',
          staffId,
          packerLogId,
          variant: 'order',
          scannedValue: String(tracking || orderId || ''),
          trackingType: 'ORDERS',
          order: orderId ? { orderId } : null,
          // Fresh per send — the phone keys its dedupe on this, AND echoes it
          // back as the ack correlation id.
          requestId,
          source: 'pack-identity-bar',
        });
      },
    });
  }, [channelName, getClient, orderId, packerLogId, phone, staffId, tracking]);

  const hasPhotos = count > 0;

  // Waiting/answered/unreachable renders on the house toast surface — the
  // identity row keeps the exact chrome geometry regardless of phone.state.
  // Face matches Unbox ReceivingPhotoButton appearance="chrome": camera + count.
  return (
    <div className="relative flex h-full min-h-0 shrink-0 self-stretch items-stretch">
      <HoverTooltip
        label={hasPhotos ? `Photos ${count} · phone` : 'Send to phone'}
        placement="right"
        asChild
      >
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={phone.pending}
          aria-label={hasPhotos ? `Photos ${count}; send to phone` : 'Send to phone'}
          className={STATION_CONTEXT_PHOTO_CHROME_CLASS}
          data-testid="pack-send-to-phone"
        >
          <Camera className={STATION_CHROME_GLYPH_CLASS} aria-hidden />
          <span className="leading-none tabular-nums">{count}</span>
        </button>
      </HoverTooltip>
    </div>
  );
}
