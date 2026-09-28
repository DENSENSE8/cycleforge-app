'use client';

import { useCallback } from 'react';
import { usePageSettings } from '@/hooks/useSettings';
import { playScanTone, vibratePress, vibrateScan, type ScanFeedbackKind } from './play';
import { flashScanBand } from './visual';

/** The station-wide scan-feedback switches (registry page `scan`): org master sound switch + per-staff sound / haptics. */
function useScanFeedbackSettings() {
  const { byKey } = usePageSettings('scan');
  const orgSoundsEnabled = (byKey('scan.soundsEnabled')?.value ?? false) as boolean;
  const staffSound = (byKey('scan.sound')?.value ?? true) as boolean;
  const staffHaptics = (byKey('scan.haptics')?.value ?? true) as boolean;
  return { soundOn: orgSoundsEnabled && staffSound, hapticOn: staffHaptics };
}

/** Resolved scan-feedback firing for any station: tone + buzz behind the settings, plus the scan-band flash. */
export function useScanFeedback() {
  const { soundOn, hapticOn } = useScanFeedbackSettings();

  const playScanFeedback = useCallback(
    (kind: ScanFeedbackKind) => {
      if (soundOn) playScanTone(kind);
      if (hapticOn) vibrateScan(kind);
      // `warn` still landed — the band reads it as a success.
      flashScanBand(kind === 'reject' ? 'reject' : 'success');
    },
    [soundOn, hapticOn],
  );

  return { playScanFeedback };
}

/** The press buzz of a flush execution cell (dock verb, tap-to-copy fact), behind the same staff toggle as the scan buzz. */
export function usePressHaptic(): () => void {
  const { hapticOn } = useScanFeedbackSettings();
  return useCallback(() => {
    if (hapticOn) vibratePress();
  }, [hapticOn]);
}
