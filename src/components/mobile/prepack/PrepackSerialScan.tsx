'use client';

import { MobileV2ScanInput } from '@/components/mobile/v2/scan/MobileV2ScanInput';
import type { PrepackSerialEntryProps } from '@/features/prepack/serial-entry';

/** Phone serial entry: the camera scan input. Each decode adds one serial to the package. */
export function PrepackSerialScan({ onSerial, busy }: PrepackSerialEntryProps) {
  return (
    <MobileV2ScanInput
      onDecode={onSerial}
      placeholder="Scan serial or unit label"
      autoFocus
      prominentCamera
      isResolving={busy}
    />
  );
}
