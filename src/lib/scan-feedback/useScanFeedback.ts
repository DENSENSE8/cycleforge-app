'use client';

import { useCallback } from 'react';
import { usePageSettings } from '@/hooks/useSettings';
import { playScanTone, vibratePress, vibrateScan, type ScanFeedbackKind } from './play';
import { flashScanBand } from './visual';

/**
 * Resolved scan-feedback firing for the receiving station. Reads the org master
 * switch (`receiving.scanSoundsEnabled`) and the per-staff toggles
 * (`receiving.scanSound`, `receiving.scanHaptics`) from the Settings Registry —
 * sound plays only when the org allows AND the operator hasn't opted out; haptics
 * follow the operator's own toggle.
 *
 * Visual locus flash ({@link flashScanBand}) always fires — flat scan stations
 * rely on it for success vs reject once card borders are gone. Audio/haptic stay
 * preference-gated.
 *
 * Async-cached reads are fine here: the page settings load once and are warm by
 * the time an operator completes a receive, so the cue never lags the action.
 */
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

/**
 * The press buzz of a flush execution cell (dock verb, tap-to-copy fact),
 * behind the same staff toggle as the scan buzz (`receiving.scanHaptics`,
 * default OFF). A no-op until the operator opts in, and always on iOS Safari,
 * which has no Vibration API — iPhones get the press inversion only.
 */
export function usePressHaptic(): () => void {
  const { byKey } = usePageSettings('receiving');
  const on = (byKey('receiving.scanHaptics')?.value ?? false) as boolean;
  return useCallback(() => {
    if (on) vibratePress();
  }, [on]);
}
