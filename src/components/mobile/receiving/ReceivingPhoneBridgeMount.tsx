'use client';

import { ReceivingShareToPhoneSheet } from '@/components/mobile/receiving/ReceivingShareToPhoneSheet';
import { ReceivingPhotoRequestCamera } from '@/components/mobile/receiving/ReceivingPhotoRequestCamera';
import { UnitPhotoRequestCamera } from '@/components/mobile/unit/UnitPhotoRequestCamera';
import { SkuStockPhotoRequestCamera } from '@/components/mobile/stock/SkuStockPhotoRequestCamera';
import { PackerScanReadyCamera } from '@/components/mobile/packer/PackerScanReadyCamera';
import { PrepackSerialRequestReceiver } from '@/components/mobile/prepack/PrepackSerialRequestReceiver';

/** Mount-only phone↔desktop receiving bridge. */
export function ReceivingPhoneBridgeMount() {
  return (
    <>
      <ReceivingShareToPhoneSheet />
      <ReceivingPhotoRequestCamera />
      <UnitPhotoRequestCamera />
      <SkuStockPhotoRequestCamera />
      <PackerScanReadyCamera />
      <PrepackSerialRequestReceiver />
    </>
  );
}
