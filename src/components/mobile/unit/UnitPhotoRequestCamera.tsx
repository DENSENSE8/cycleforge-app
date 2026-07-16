'use client';

import { useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { safeChannelName, getStaffStationBridgeChannelName } from '@/lib/realtime/channels';
import { UNIT_SCAN_PHOTOS } from '@/lib/station/flags';

interface UnitPhotoRequestPayload {
  serial_unit_id?: number;
  unit_key?: string | null;
  request_id?: string;
  requested_by_staff_id?: number;
  stage?: 'testing' | 'packing' | string;
  packer_log_id?: number | null;
  po_ref?: string | null;
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
      if (requestId && lastRequestRef.current === requestId) return;
      lastRequestRef.current = requestId || null;

      if (pathnameRef.current?.endsWith('/photos') || pathnameRef.current?.includes('/unit-photos/')) {
        return;
      }

      const unitKey = String(msg?.data?.unit_key || '').trim();
      const stage = String(msg?.data?.stage || 'testing').trim() === 'packing' ? 'packing' : 'testing';
      const packerLogId = Number(msg?.data?.packer_log_id);
      const poRef = String(msg?.data?.po_ref || '').trim();
      const qs = new URLSearchParams();
      if (requestId) qs.set('requestId', requestId);
      if (unitKey) qs.set('unit', unitKey);
      if (stage === 'packing') qs.set('stage', 'packing');
      if (Number.isFinite(packerLogId) && packerLogId > 0) {
        qs.set('packerLogId', String(packerLogId));
      }
      if (poRef) qs.set('poRef', poRef);
      const suffix = qs.toString();
      router.push(`/m/unit-photos/${id}${suffix ? `?${suffix}` : ''}`);
    },
    [router],
  );

  useAblyChannel(
    stationBridgeChannel,
    'unit_photo_request',
    handleRequest,
    UNIT_SCAN_PHOTOS && !!stationBridgeChannel && staffId > 0,
  );

  return null;
}
