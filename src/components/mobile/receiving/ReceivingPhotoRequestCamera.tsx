'use client';

import { useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { safeChannelName, getStaffStationBridgeChannelName } from '@/lib/realtime/channels';
import { publishDeviceAck } from '@/lib/realtime/device-handshake';
import {
  mobileCaptureHrefForRequest,
  normalizeReceivingPhotoRequest,
  type ReceivingPhotoRequestMessage,
} from '@/lib/receiving/photo-scope';

/** Phone-side receiver for the desktop scan → camera flow. */
export function ReceivingPhotoRequestCamera() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { getClient } = useAblyClient();
  const orgId = user?.organizationId;
  const staffId = user?.staffId ?? 0;
  const stationBridgeChannel = safeChannelName(() => getStaffStationBridgeChannelName(orgId!, staffId));

  // Dedupe: Ably can redeliver and the desktop fires one request per scan —
  // ignore a request_id we already routed on.
  const lastRequestRef = useRef<string | null>(null);
  // Read pathname via a ref so the handler closure always sees the live route
  // without re-subscribing the channel on every navigation.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const handleRequest = useCallback(
    (msg: { data?: ReceivingPhotoRequestMessage }) => {
      // Stage-aware v2 payloads route by stage; legacy v1 messages (no stage)
      // normalize to an arrival capture — same page as before.
      const request = normalizeReceivingPhotoRequest(msg?.data);
      if (!request) return;

      // ACK as soon as the request PARSES — before every early return below.
      if (request.requestId && stationBridgeChannel) {
        void getClient()
          .then((client) =>
            publishDeviceAck(
              client?.channels.get(stationBridgeChannel),
              request.requestId,
              'receiving_photo',
            ),
          )
          .catch(() => {});
      }

      if (request.requestId && lastRequestRef.current === request.requestId) return;
      lastRequestRef.current = request.requestId;

      // Already on a capture surface — don't yank the operator out of an
      // in-progress camera/upload session for the previous carton.
      if (pathnameRef.current?.endsWith('/photos')) return;

      // Carton stages open /m/r/{id}/photos; unbox_item opens the PO item capture with the line id.
      router.push(mobileCaptureHrefForRequest(request));
    },
    [router, getClient, stationBridgeChannel],
  );

  useAblyChannel(
    stationBridgeChannel,
    'receiving_photo_request',
    handleRequest,
    !!stationBridgeChannel && staffId > 0,
  );

  return null;
}
