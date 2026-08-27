'use client';

import { ReceivingShareToPhoneSheet } from '@/components/mobile/receiving/ReceivingShareToPhoneSheet';
import { ReceivingPhotoRequestCamera } from '@/components/mobile/receiving/ReceivingPhotoRequestCamera';
import { UnitPhotoRequestCamera } from '@/components/mobile/unit/UnitPhotoRequestCamera';
import { PackerScanReadyCamera } from '@/components/mobile/packer/PackerScanReadyCamera';

/**
 * Mount-only phone↔desktop receiving bridge. Subscribes to Ably on
 * `staffstation:{staffId}` (desktop scan / share) and routes the operator to
 * the capture surface. Mount once per app shell so `/receiving` mobile and
 * `/m/*` both get implicit pairing without duplicating listener logic.
 *
 * Also hosts:
 *   • unit-label photo receiver (`unit_photo_request` → `/m/unit-photos/{id}`)
 *   • packer order-scan receiver (`scan_ready` → `/m/p/{id}/photos`)
 */
export function ReceivingPhoneBridgeMount() {
  return (
    <>
      <ReceivingShareToPhoneSheet />
      <ReceivingPhotoRequestCamera />
      <UnitPhotoRequestCamera />
      <PackerScanReadyCamera />
    </>
  );
}
