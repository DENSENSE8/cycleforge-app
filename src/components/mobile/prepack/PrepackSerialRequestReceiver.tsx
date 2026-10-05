'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { publishDeviceAck, type DeviceAckKind } from '@/lib/realtime/device-handshake';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import {
  PREPACK_SERIAL_REQUEST_EVENT,
  PREPACK_CATALOG_PHOTO_REQUEST_EVENT,
  consumeLocalPrepackCatalogPhotoRequest,
  consumeLocalPrepackSerialRequest,
  parsePrepackCatalogPhotoRequest,
  parsePrepackSerialRequest,
  prepackSerialBridgeChannel,
  prepackSerialHandoffHref,
} from '@/lib/realtime/prepack-serial-request';

/** Phone-side receiver: open the camera-ready serial step for the desk run. */
export function PrepackSerialRequestReceiver() {
  const router = useRouter();
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const channel = prepackSerialBridgeChannel(user?.organizationId, staffId);
  const { getClient } = useAblyClient();
  const lastRequest = useRef<string | null>(null);
  const lastCatalogPhotoRequest = useRef<string | null>(null);
  const ack = useCallback((requestId: string, kind: DeviceAckKind) => {
    void getClient()
      .then((client) => publishDeviceAck(client?.channels.get(channel), requestId, kind))
      .catch(() => {});
  }, [channel, getClient]);
  const onRequest = useCallback((message: { data?: unknown }) => {
    const request = parsePrepackSerialRequest(message?.data);
    if (!request || consumeLocalPrepackSerialRequest(request.requestId)) return;
    ack(request.requestId, 'prepack_serial');
    if (request.requestId === lastRequest.current) return;
    lastRequest.current = request.requestId;
    router.push(prepackSerialHandoffHref(request));
  }, [ack, router]);
  useAblyChannel(channel, PREPACK_SERIAL_REQUEST_EVENT, onRequest, Boolean(channel));
  const onCatalogPhoto = useCallback((message: { data?: unknown }) => {
    const request = parsePrepackCatalogPhotoRequest(message?.data);
    if (!request || consumeLocalPrepackCatalogPhotoRequest(request.requestId)) return;
    ack(request.requestId, 'catalog_photo');
    if (request.requestId === lastCatalogPhotoRequest.current) return;
    lastCatalogPhotoRequest.current = request.requestId;
    router.push(`/m/products/${encodeURIComponent(request.sku)}`);
  }, [ack, router]);
  useAblyChannel(channel, PREPACK_CATALOG_PHOTO_REQUEST_EVENT, onCatalogPhoto, Boolean(channel));
  return null;
}
