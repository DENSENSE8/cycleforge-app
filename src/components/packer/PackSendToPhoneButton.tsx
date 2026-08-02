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
 * Face + captured count come from the shared station pill tokens, so Pack and
 * Unbox read identically in the identity row.
 */

import { useCallback } from 'react';
import { Camera, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { STATION_CONTEXT_PHOTO_PILL_CLASS } from '@/components/station/entity-context/station-context-action-pill';
import { useSendToDevice } from '@/components/station/send-to-device/useSendToDevice';
import { SendToDeviceStatus } from '@/components/station/send-to-device/SendToDeviceStatus';
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

  // Same handshake and same status card as the Unbox carton pill (P1 · D2):
  // `scan_ready` used to publish blind, so a locked phone was indistinguishable
  // from a delivered request.
  const phone = useSendToDevice('pack_scan');

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

  const pill = (
    <HoverTooltip
      label={hasPhotos ? `${count} pack photo${count === 1 ? '' : 's'} · send to phone` : 'Send to phone'}
      asChild
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void handleSend()}
        disabled={phone.pending}
        ariaLabel={
          hasPhotos
            ? `${count} pack photo${count === 1 ? '' : 's'}; send capture request to phone`
            : 'Send capture request to phone'
        }
        icon={<Camera className="h-4 w-4" />}
        iconRight={hasPhotos ? undefined : <Plus className="h-3 w-3" />}
        className={STATION_CONTEXT_PHOTO_PILL_CLASS}
      >
        {hasPhotos ? count : null}
      </Button>
    </HoverTooltip>
  );

  // No pairing state → render the bare pill, so the identity row keeps the exact
  // geometry it had before this wrapper existed.
  if (phone.state === 'idle') return pill;

  return (
    <div className="relative shrink-0">
      {pill}
      {/* Anchored under the pill — absolute, so an "unreachable" row cannot
          grow the pack identity row mid-scan (mirrors the Unbox carton pill). */}
      <div className="absolute right-0 top-full z-30 w-max max-w-[18rem] pt-1.5">
        <SendToDeviceStatus state={phone.state} onRetry={phone.retry} />
      </div>
    </div>
  );
}
