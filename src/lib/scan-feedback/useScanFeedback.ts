'use client';

import { useCallback } from 'react';
import { usePageSettings } from '@/hooks/useSettings';
import { playScanTone, vibratePress, vibrateScan, type ScanFeedbackKind } from './play';
import { flashScanBand } from './visual';

/** Resolved scan-feedback firing for the receiving station. */
export function useScanFeedback() {
  const { byKey } = usePageSettings('receiving');

  const orgSoundsEnabled = (byKey('receiving.scanSoundsEnabled')?.value ?? false) as boolean;
  const staffSound = (byKey('receiving.scanSound')?.value ?? true) as boolean;
  const staffHaptics = (byKey('receiving.scanHaptics')?.value ?? false) as boolean;

  const soundOn = orgSoundsEnabled && staffSound;
  const hapticOn = staffHaptics;

  const playScanFeedback = useCallback(
    (kind: ScanFeedbackKind) => {
      if (soundOn) playScanTone(kind);
      if (hapticOn) vibrateScan(kind);
      flashScanBand(kind);
    },
    [soundOn, hapticOn],
  );

  return { playScanFeedback, soundOn, hapticOn };
}

/** The press buzz of a flush execution cell (dock verb, tap-to-copy fact), behind the same staff toggle as the scan buzz… */
export function usePressHaptic(): () => void {
  const { byKey } = usePageSettings('receiving');
  const on = (byKey('receiving.scanHaptics')?.value ?? false) as boolean;
  return useCallback(() => {
    if (on) vibratePress();
  }, [on]);
}
