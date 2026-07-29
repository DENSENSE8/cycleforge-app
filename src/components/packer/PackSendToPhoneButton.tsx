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

import { useCallback, useState } from 'react';
import { Camera, Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { STATION_CONTEXT_PHOTO_PILL_CLASS } from '@/components/station/entity-context/station-context-action-pill';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { safeChannelName, getPackerBridgeChannelName } from '@/lib/realtime/channels';
import { safeRandomUUID } from '@/lib/safe-uuid';
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

  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    if (!channelName || staffId <= 0) {
      toast.error('Sign in on your phone to take photos');
      return;
    }
    setSending(true);
    try {
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
        // Fresh per click — the phone keys its dedupe on this when present.
        requestId: safeRandomUUID(),
        source: 'pack-identity-bar',
      });
      toast.success('Sent to phone');
    } catch (err) {
      console.warn('pack-send-to-phone: publish failed', err);
      toast.error('Could not send to phone');
    } finally {
      setSending(false);
    }
  }, [channelName, getClient, orderId, packerLogId, staffId, tracking]);

  const hasPhotos = count > 0;

  return (
    <HoverTooltip
      label={hasPhotos ? `${count} pack photo${count === 1 ? '' : 's'} · send to phone` : 'Send to phone'}
      asChild
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void handleSend()}
        disabled={sending}
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
}
