'use client';

import { MobileV2ScanInput } from '@/components/mobile/v2/scan/MobileV2ScanInput';
import type { PrepackSerialEntryProps } from '@/features/prepack/serial-entry';

/** Phone serial entry: the camera scan input. The phone is the scanner, so the desk handoff does not apply. */
export function PrepackSerialScan({ onSerial, busy, label, autoFocus = true }: PrepackSerialEntryProps) {
  return (
    <MobileV2ScanInput
      onDecode={onSerial}
      placeholder={label ? `Scan ${label.toLowerCase()}` : 'Scan serial or unit label'}
      autoFocus={autoFocus}
      prominentCamera={autoFocus}
      compact={!autoFocus}
      isResolving={busy}
    />
  );
}
