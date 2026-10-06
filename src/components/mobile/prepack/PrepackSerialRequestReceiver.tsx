'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { publishDeviceAck } from '@/lib/realtime/device-handshake';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import {
  PREPACK_SERIAL_REQUEST_EVENT,
  consumeLocalPrepackSerialRequest,
  parsePrepackSerialRequest,
  prepackSerialBridgeChannel,
  prepackSerialHandoffHref,
} from '@/lib/realtime/prepack-serial-request';

/** Phone-side receiver: open the camera-ready serial reply screen for the desk form. */
export function PrepackSerialRequestReceiver() {
  const router = useRouter();
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;
  const channel = prepackSerialBridgeChannel(user?.organizationId, staffId);
  const { getClient } = useAblyClient();
  const lastRequest = useRef<string | null>(null);
  const onRequest = useCallback((message: { data?: unknown }) => {
    const request = parsePrepackSerialRequest(message?.data);
    if (!request || consumeLocalPrepackSerialRequest(request.requestId)) return;
    void getClient()
      .then((client) => publishDeviceAck(client?.channels.get(channel), request.requestId, 'prepack_serial'))
      .catch(() => {});
    if (request.requestId === lastRequest.current) return;
    lastRequest.current = request.requestId;
    router.push(prepackSerialHandoffHref(request));
  }, [channel, getClient, router]);
  useAblyChannel(channel, PREPACK_SERIAL_REQUEST_EVENT, onRequest, Boolean(channel));
  return null;
}
