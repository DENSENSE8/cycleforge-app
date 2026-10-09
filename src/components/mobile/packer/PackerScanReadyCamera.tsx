'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { safeChannelName, getPackerBridgeChannelName } from '@/lib/realtime/channels';
import { publishDeviceAck } from '@/lib/realtime/device-handshake';
import { PACKING_PATHS } from '@/lib/nav/route-tree';
import { packerPhotoUploadQueue } from '@/components/mobile/packer/PackerPhotoUploadQueue';

/** `/m/p/<packerLogId>/photos` — the packer capture this listener itself opens. */
const PACKER_CAPTURE_PATH = /^\/m\/p\/(\d+)\/photos\/?$/;

interface PackerScanReadyPayload {
  type?: string;
  staffId?: number;
  packerLogId?: number | null;
  variant?: string;
  scannedValue?: string;
  order?: { orderId?: string; productTitle?: string } | null;
  fba?: { productTitle?: string } | null;
  /** Present on a MANUAL re-send from the desktop pack identity bar ({@link PackSendToPhoneButton}). */
  requestId?: string;
}

/**
 * Phone listener for desktop packing scans. Also the app-wide resume point for
 * the packer upload queue: shots left pending by a reload or a dropped network
 * push again on every phone page, not only when the capture screen reopens.
 */
export function PackerScanReadyCamera() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { getClient } = useAblyClient();
  const orgId = user?.organizationId;
  const staffId = user?.staffId ?? 0;
  const channel = safeChannelName(() => getPackerBridgeChannelName(orgId!, staffId));

  const lastKeyRef = useRef<string | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    packerPhotoUploadQueue.resume();
  }, []);

  const handleReady = useCallback(
    (msg: { data?: PackerScanReadyPayload }) => {
      const data = msg?.data;
      if (!data) return;
      const packerLogId = Number(data.packerLogId);
      if (!Number.isFinite(packerLogId) || packerLogId <= 0) return;

      // ACK before the dedupe / already-capturing early returns below:
      if (data.requestId && channel) {
        void getClient()
          .then((client) =>
            publishDeviceAck(client?.channels.get(channel), data.requestId, 'pack_scan'),
          )
          .catch(() => {});
      }

      const key = data.requestId
        ? `req:${data.requestId}`
        : `${packerLogId}:${data.scannedValue || ''}`;
      if (lastKeyRef.current === key) return;
      lastKeyRef.current = key;

      // The next desk scan always moves the packer to that order's capture —
      // shots already taken upload on their own (queued at the shutter, never
      // behind ✓). Same order already open: stay. Other capture screens
      // (Unbox, unit photos) are never hijacked.
      const current = pathnameRef.current ?? '';
      const openPack = PACKER_CAPTURE_PATH.exec(current);
      if (openPack && Number(openPack[1]) === packerLogId) return;
      if (!openPack && (current.endsWith('/photos') || current.includes('/unit-photos/'))) return;

      // Deep-link: the order number + product title paint the camera's top-left;
      // closing the capture always returns to the Packing photo feed.
      const qs = new URLSearchParams();
      const orderId = String(data.order?.orderId || '').trim();
      if (orderId) qs.set('orderId', orderId);
      const title = String(data.order?.productTitle || data.fba?.productTitle || '').trim();
      if (title) qs.set('title', title);
      qs.set('back', PACKING_PATHS.mobile);
      router.replace(`/m/p/${packerLogId}/photos?${qs.toString()}`);
    },
    [router, getClient, channel],
  );

  useAblyChannel(channel, 'scan_ready', handleReady, !!channel && staffId > 0);

  return null;
}
