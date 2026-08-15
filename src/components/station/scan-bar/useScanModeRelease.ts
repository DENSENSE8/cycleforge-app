'use client';

import { useEffect } from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isCapturing } from '@/lib/scan-hotkey/store';
import { isStationScanInputFocused, shouldHandleScanModeEsc } from './scan-mode';

/**
 * Esc on a focused station scan input releases the armed type back to Auto.
 * Stands down for overlays and the hotkey-rebind popover. Does not clear text.
 */
export function useScanModeRelease(armed: boolean, onRelease: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !shouldHandleScanModeEsc({
          key: event.key,
          armed,
          overlayOpen: hasOpenOverlay(),
          capturing: isCapturing(),
          scanInputFocused: isStationScanInputFocused(event.target),
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
