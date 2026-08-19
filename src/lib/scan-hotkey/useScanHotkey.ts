'use client';

import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import {
  getHotkey,
  registerScanTarget,
  setCapturing,
  setHotkey,
  subscribe,
} from './store';

/** Live focus-scan binding + setter. Re-renders when the key changes anywhere. */
export function useScanHotkey() {
  const hotkey = useSyncExternalStore(subscribe, getHotkey, getHotkey);
  return { hotkey, setHotkey, setCapturing };
}

/**
 * Register a scan input as the hotkey's focus / next-scan target while mounted.
 * Most recently mounted bar wins. Insert focuses; ⌘. clears + focuses (arm next).
 */
export function useRegisterScanTarget(
  inputRef: RefObject<HTMLInputElement | null>,
  enabled = true,
  /** Clear the controlled value before focusing — required for ⌘. arm-next. */
  clearValue?: () => void,
  /**
   * Accept a wedge payload into this bar (Preview stance). Return false to
   * decline and let the global scanner keep its normal ladder.
   */
  deliverValue?: (value: string) => boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    return registerScanTarget({
      deliver: deliverValue,
      focus: () => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.select();
      },
      armNext: () => {
        clearValue?.();
        // Wait a frame so controlled clear paints before select.
        requestAnimationFrame(() => {
          const el = inputRef.current;
          if (!el) return;
          el.focus();
          el.select();
        });
      },
    });
  }, [inputRef, enabled, clearValue, deliverValue]);
}
