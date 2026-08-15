'use client';

import { useEffect, useRef } from 'react';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { isCapturing } from '@/lib/scan-hotkey/store';
import { toggleScanStance } from './scan-stance';
import { isStationScanInputFocused } from './scan-mode';
import {
  isWedgeBurst,
  resolveTypeKeybind,
  WEDGE_MAX_INTER_KEY_MS,
} from './scan-type-keybinds';

interface UseScanTypeKeybindsOpts<T extends string> {
  modes: readonly T[];
  armedMode: T | null;
  onToggleMode?: (mode: T) => void;
  value: string;
  onChange: (next: string) => void;
  enabled?: boolean;
}

/**
 * 1–4 arm the nth type after Auto; 0 / ` release; empty-field P toggles
 * Preview/Scan. Yields to HID wedge bursts (same inter-key window as
 * wedgeReduce) so a scanner's "1…Enter" is still a scan.
 */
export function useScanTypeKeybinds<T extends string>({
  modes,
  armedMode,
  onToggleMode,
  value,
  onChange,
  enabled = true,
}: UseScanTypeKeybindsOpts<T>): void {
  const valueRef = useRef(value);
  valueRef.current = value;
  const armedRef = useRef(armedMode);
  armedRef.current = armedMode;
  const onToggleRef = useRef(onToggleMode);
  onToggleRef.current = onToggleMode;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const modesRef = useRef(modes);
  modesRef.current = modes;

  const lastPrintableAt = useRef(0);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const clearPending = () => {
      if (timer.current != null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      pending.current = null;
    };

    const commitPendingArm = (key: string) => {
      pending.current = null;
      timer.current = null;
      const action = resolveTypeKeybind({
        key,
        fieldEmpty: true,
        scanInputFocused: true,
        overlayOpen: hasOpenOverlay(),
        capturing: isCapturing(),
        altKey: false,
        metaKey: false,
        ctrlKey: false,
        modeCount: modesRef.current.length,
        wedgeBurst: false,
      });
      if (action.kind === 'arm') {
        const mode = modesRef.current[action.index];
        if (mode && armedRef.current !== mode) onToggleRef.current?.(mode);
      } else if (action.kind === 'auto') {
        const current = armedRef.current;
        if (current) onToggleRef.current?.(current);
      } else if (action.kind === 'toggle-stance') {
        toggleScanStance();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isStationScanInputFocused(event.target)) return;
      if (hasOpenOverlay() || isCapturing()) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const now = event.timeStamp;
      const burst = isWedgeBurst(lastPrintableAt.current, now);
      if (event.key.length === 1) lastPrintableAt.current = now;

      // A follow-up key during a pending mode-key → this is a scanner burst.
      if (pending.current != null && event.key.length === 1) {
        event.preventDefault();
        event.stopPropagation();
        const flushed = pending.current + event.key;
        clearPending();
        onChangeRef.current(valueRef.current + flushed);
        return;
      }
      if (pending.current != null && (event.key === 'Enter' || event.key === 'Tab')) {
        const flushed = pending.current;
        clearPending();
        onChangeRef.current(valueRef.current + flushed);
        // Let Enter submit the now-filled field.
        return;
      }

      const empty = valueRef.current.trim() === '';
      const action = resolveTypeKeybind({
        key: event.key,
        fieldEmpty: empty,
        scanInputFocused: true,
        overlayOpen: false,
        capturing: false,
        altKey: false,
        metaKey: false,
        ctrlKey: false,
        modeCount: modesRef.current.length,
        wedgeBurst: burst,
      });
      if (action.kind === 'none') return;

      event.preventDefault();
      event.stopPropagation();
      pending.current = event.key;
      timer.current = setTimeout(() => {
        const key = pending.current;
        if (key) commitPendingArm(key);
      }, WEDGE_MAX_INTER_KEY_MS);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      clearPending();
    };
  }, [enabled]);
}
