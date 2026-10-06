'use client';

import { useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { publishDeviceAck } from '@/lib/realtime/device-handshake';
import { parsePhotoAspect } from '@/lib/photos/photo-aspects';
import { unitPhotoCaptureHref } from '@/lib/photos/unit-photo-capture-href';
import { safeChannelName, getStaffStationBridgeChannelName } from '@/lib/realtime/channels';
import { consumeLocalUnitPhotoRequest } from '@/lib/realtime/unit-photo-request-local';

interface UnitPhotoRequestPayload {
  serial_unit_id?: number;
  unit_key?: string | null;
  request_id?: string;
  requested_by_staff_id?: number;
  stage?: 'testing' | 'packing' | string;
  packer_log_id?: number | null;
  po_ref?: string | null;
  aspect?: string | null;
}

/**
 * Phone-side receiver for unit-label scan → camera. Testing mode and packing
 * mode both publish `unit_photo_request` on `staffstation:{staffId}`; packing
 * includes stage + packer_log_id so uploads dual-link to the pack event.
 */
export function UnitPhotoRequestCamera() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { getClient } = useAblyClient();
  const orgId = user?.organizationId;
  const staffId = user?.staffId ?? 0;
  const stationBridgeChannel = safeChannelName(() => getStaffStationBridgeChannelName(orgId!, staffId));

  const lastRequestRef = useRef<string | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const handleRequest = useCallback(
    (msg: { data?: UnitPhotoRequestPayload }) => {
      const id = Number(msg?.data?.serial_unit_id);
      if (!Number.isFinite(id) || id <= 0) return;

      const requestId = String(msg?.data?.request_id || '').trim();
      if (consumeLocalUnitPhotoRequest(requestId)) return;
      if (requestId && stationBridgeChannel) {
        void getClient()
          .then((client) => publishDeviceAck(client?.channels.get(stationBridgeChannel), requestId, 'unit_photo'))
          .catch(() => {});
      }
      if (requestId && lastRequestRef.current === requestId) return;
      lastRequestRef.current = requestId || null;

      if (pathnameRef.current?.endsWith('/photos') || pathnameRef.current?.includes('/unit-photos/')) {
        return;
      }

      const requestedStage = String(msg?.data?.stage || 'testing').trim();
      router.push(
        unitPhotoCaptureHref(id, {
          requestId,
          unit: msg?.data?.unit_key ?? null,
          stage: requestedStage === 'packing' ? 'packing' : 'testing',
          aspect: parsePhotoAspect(msg?.data?.aspect),
          packerLogId: Number(msg?.data?.packer_log_id),
          poRef: msg?.data?.po_ref ?? null,
        }),
      );
    },
    [getClient, router, stationBridgeChannel],
  );

  useAblyChannel(
    stationBridgeChannel,
    'unit_photo_request',
    handleRequest,
    !!stationBridgeChannel && staffId > 0,
  );

  return null;
}
