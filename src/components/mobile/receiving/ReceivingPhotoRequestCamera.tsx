'use client';

import { useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { safeChannelName, getStaffStationBridgeChannelName } from '@/lib/realtime/channels';
import {
  mobileCaptureHrefForRequest,
  normalizeReceivingPhotoRequest,
  type ReceivingPhotoRequestMessage,
} from '@/lib/receiving/photo-scope';

/**
 * Phone-side receiver for the desktop scan → camera flow. When the receiving
 * workstation matches a PO# or tracking scan it publishes
 * `receiving_photo_request` on `staffstation:{staffId}` (implicit pairing — the
 * channel name is the gate, no claim flow). Here the SAME staff's phone
 * auto-opens the MobilePackerSpamCamera by routing to the existing
 * `/m/r/{id}/photos?requestId=` capture page, so the operator can immediately
 * shoot unboxing photos for whatever they just scanned in — no taps on the
 * phone required.
 *
 * Unlike `ReceivingShareToPhoneSheet` (an explicit desktop button → a confirm
 * sheet), a scan is the operator's intent to start unboxing, so we skip the
 * prompt and open the camera directly.
 *
 * Mounted once in the global mobile shell so it fires regardless of which /m
 * page the phone is parked on.
 */
export function ReceivingPhotoRequestCamera() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
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

      if (request.requestId && lastRequestRef.current === request.requestId) return;
      lastRequestRef.current = request.requestId;

      // Already on a capture surface — don't yank the operator out of an
      // in-progress camera/upload session for the previous carton.
      if (pathnameRef.current?.endsWith('/photos')) return;

      // Carton stages open /m/r/{id}/photos; unbox_item opens the PO item
      // capture with the line id. The capture page resolves the PO title +
      // poRef itself; requestId drives the per-photo `receiving_photo_uploaded`
      // echo back to the desktop.
      router.push(mobileCaptureHrefForRequest(request));
    },
    [router],
  );

  useAblyChannel(
    stationBridgeChannel,
    'receiving_photo_request',
    handleRequest,
    !!stationBridgeChannel && staffId > 0,
  );

  return null;
}
