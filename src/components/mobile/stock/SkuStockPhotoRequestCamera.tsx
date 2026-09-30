'use client';

import { useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { publishDeviceAck } from '@/lib/realtime/device-handshake';
import {
  SKU_STOCK_PHOTO_REQUEST_EVENT,
  getSkuStockPhotoRequestChannelName,
  parseSkuStockPhotoRequest,
  skuStockPhotoCaptureHref,
} from '@/lib/realtime/sku-stock-photo-request';

/** Phone-side receiver for the desk stock record's "Send to phone" → product-photo camera. */
export function SkuStockPhotoRequestCamera() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { getClient } = useAblyClient();
  const staffId = user?.staffId ?? 0;
  const stationBridgeChannel = getSkuStockPhotoRequestChannelName(user?.organizationId, staffId);

  // Ably can redeliver — route once per request id.
  const lastRequestRef = useRef<string | null>(null);
  // Live route without re-subscribing on every navigation.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const handleRequest = useCallback(
    (msg: { data?: unknown }) => {
      const request = parseSkuStockPhotoRequest(msg?.data);
      if (!request) return;

      // ACK as soon as the request parses — before every early return below.
      if (request.requestId && stationBridgeChannel) {
        void getClient()
          .then((client) =>
            publishDeviceAck(client?.channels.get(stationBridgeChannel), request.requestId, 'stock_photo'),
          )
          .catch(() => {});
      }

      if (request.requestId && lastRequestRef.current === request.requestId) return;
      lastRequestRef.current = request.requestId;

      // Already on a capture surface — never yank the operator out of one.
      const current = pathnameRef.current ?? '';
      if (current.endsWith('/photos') || current.includes('/unit-photos/')) return;

      router.push(skuStockPhotoCaptureHref(request, current.startsWith('/m') ? current : null));
    },
    [getClient, router, stationBridgeChannel],
  );

  useAblyChannel(
    stationBridgeChannel,
    SKU_STOCK_PHOTO_REQUEST_EVENT,
    handleRequest,
    !!stationBridgeChannel && staffId > 0,
  );

  return null;
}
