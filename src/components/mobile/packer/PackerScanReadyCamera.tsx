'use client';

import { useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { safeChannelName, getPackerBridgeChannelName } from '@/lib/realtime/channels';

interface PackerScanReadyPayload {
  type?: string;
  staffId?: number;
  packerLogId?: number | null;
  variant?: string;
  scannedValue?: string;
  order?: { orderId?: string } | null;
}

/**
 * Phone listener for desktop packing scans. When StationPacking completes a
 * tracking pack and publishes `packer.scan_ready` on `packer:{staffId}`, the
 * same staff's phone opens `/m/p/{packerLogId}/photos` (order pack photos).
 *
 * Unit-QR packing photos use `unit_photo_request` (UnitPhotoRequestCamera) —
 * this listener covers the order/tracking pack path (unbox-parity auto camera).
 */
export function PackerScanReadyCamera() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
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

      const key = `${packerLogId}:${data.scannedValue || ''}`;
      if (lastKeyRef.current === key) return;
      lastKeyRef.current = key;

      if (pathnameRef.current?.endsWith('/photos') || pathnameRef.current?.includes('/unit-photos/')) {
        return;
      }

      router.push(`/m/p/${packerLogId}/photos`);
    },
    [router],
  );

  useAblyChannel(channel, 'scan_ready', handleReady, !!channel && staffId > 0);

  return null;
}
