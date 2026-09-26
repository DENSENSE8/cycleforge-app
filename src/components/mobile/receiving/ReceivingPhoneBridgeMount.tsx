'use client';

import { ReceivingShareToPhoneSheet } from '@/components/mobile/receiving/ReceivingShareToPhoneSheet';
import { ReceivingPhotoRequestCamera } from '@/components/mobile/receiving/ReceivingPhotoRequestCamera';
import { UnitPhotoRequestCamera } from '@/components/mobile/unit/UnitPhotoRequestCamera';
import { PackerScanReadyCamera } from '@/components/mobile/packer/PackerScanReadyCamera';

/** Mount-only phone↔desktop receiving bridge. */
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
