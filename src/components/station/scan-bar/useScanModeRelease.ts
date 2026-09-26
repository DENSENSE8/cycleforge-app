'use client';

import { useEffect } from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isCapturing } from '@/lib/scan-hotkey/store';
import { consumeScanEscBlock } from './scan-esc-block';
import { isStationScanInputFocused, shouldHandleScanModeEsc } from './scan-mode';

/** Esc on a focused station scan input: */
export function useScanModeRelease(armed: boolean, onRelease: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!isStationScanInputFocused(event.target)) return;
      if (hasOpenOverlay() || isCapturing()) return;

      if (consumeScanEscBlock()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (
        !shouldHandleScanModeEsc({
          key: event.key,
          armed,
          overlayOpen: false,
          capturing: false,
          scanInputFocused: true,
        })
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onRelease();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [armed, onRelease]);
}
