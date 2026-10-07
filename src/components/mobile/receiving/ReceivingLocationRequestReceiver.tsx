'use client';

import { useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { publishDeviceAck } from '@/lib/realtime/device-handshake';
import {
  RECEIVING_LOCATION_REQUEST_EVENT,
  parseReceivingLocationRequest,
  receivingLocationRequestChannel,
} from '@/lib/realtime/receiving-location-request';
import { lpnLocationMobileHref } from '@/lib/nav/route-tree';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';

/** Where a placed LPN returns when the phone was not on a phone page (`/m/unbox`). */
const DEFAULT_RETURN = '/m/unbox';

/** Phone-side receiver: the Unbox desk asked for a location scan — open the LPN location screen. */
export function ReceivingLocationRequestReceiver() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { getClient } = useAblyClient();
  const staffId = user?.staffId ?? 0;
  const channel = receivingLocationRequestChannel(user?.organizationId, staffId);

  // Ably can redeliver: route once per request id.
  const lastRequestRef = useRef<string | null>(null);
  // Live route without re-subscribing on every navigation.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const onRequest = useCallback(
    (message: { data?: unknown }) => {
      const request = parseReceivingLocationRequest(message?.data);
      if (!request) return;
      // ACK as soon as the request PARSES — before every early return below.
      void getClient()
        .then((client) => publishDeviceAck(client?.channels.get(channel), request.requestId, 'receiving_location'))
        .catch(() => {});
      if (lastRequestRef.current === request.requestId) return;
      lastRequestRef.current = request.requestId;

      const here = pathnameRef.current ?? '';
      // A newer desk request REPLACES an open location screen (no stacked
      // scanners); from anywhere else the X / success returns where it was.
      const onLocationScreen = here.endsWith('/location');
      const href = lpnLocationMobileHref(request.receivingId, {
        line: request.lineId,
        back: (onLocationScreen ? null : mobileJobReturn(here)) ?? DEFAULT_RETURN,
      });
      if (onLocationScreen) router.replace(href);
      else router.push(href);
    },
    [channel, getClient, router],
  );

  useAblyChannel(channel, RECEIVING_LOCATION_REQUEST_EVENT, onRequest, Boolean(channel));
  return null;
}
