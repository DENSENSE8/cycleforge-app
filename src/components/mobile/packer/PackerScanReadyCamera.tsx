'use client';

import { useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { safeChannelName, getPackerBridgeChannelName } from '@/lib/realtime/channels';
import { publishDeviceAck } from '@/lib/realtime/device-handshake';

interface PackerScanReadyPayload {
  type?: string;
  staffId?: number;
  packerLogId?: number | null;
  variant?: string;
  scannedValue?: string;
  order?: { orderId?: string } | null;
  /** Present on a MANUAL re-send from the desktop pack identity bar ({@link PackSendToPhoneButton}). */
  requestId?: string;
}

/** Phone listener for desktop packing scans. */
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

      if (pathnameRef.current?.endsWith('/photos') || pathnameRef.current?.includes('/unit-photos/')) {
        return;
      }

      // §1d deep-link: carry the order number + start the guided flow on the
      // slip step so the phone opens straight into pack_slip capture.
      const qs = new URLSearchParams();
      const orderId = String(data.order?.orderId || '').trim();
      if (orderId) qs.set('orderId', orderId);
      qs.set('step', 'slip');
      const suffix = qs.toString();
      router.replace(`/m/p/${packerLogId}/photos${suffix ? `?${suffix}` : ''}`);
    },
    [router, getClient, channel],
  );

  useAblyChannel(channel, 'scan_ready', handleReady, !!channel && staffId > 0);

  return null;
}
