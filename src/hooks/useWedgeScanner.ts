'use client';

import { useEffect, useRef } from 'react';
import { attachWedgeKeyListener } from '@/lib/keyboard/wedge-scan-listener';
import {
  WEDGE_IDLE_FLUSH_MS,
  WEDGE_MAX_INTER_KEY_MS,
  WEDGE_MIN_LENGTH,
} from '@/lib/keyboard/wedge-scan-machine';

/** React mount adapter for the HID wedge listener SoT ({@link attachWedgeKeyListener} / {@link createWedgeKeyListener}). */
interface UseWedgeScannerOptions {
  /** Called when a complete scan buffer is committed (after a main-thread yield). */
  onScan: (value: string) => void;
  /** Inter-key gap that classifies fast-typed input as a scan. Default 50ms. */
  maxInterKeyMs?: number;
  /** Buffer flush after Enter idle. Default 80ms (after last key + Enter). */
  idleFlushMs?: number;
  /** Minimum length to accept (filters accidental keystrokes). Default 3. */
  minLength?: number;
  /** Disable the listener entirely. */
  disabled?: boolean;
}

export function useWedgeScanner(opts: UseWedgeScannerOptions): void {
  const {
    onScan,
    maxInterKeyMs = WEDGE_MAX_INTER_KEY_MS,
    idleFlushMs = WEDGE_IDLE_FLUSH_MS,
    minLength = WEDGE_MIN_LENGTH,
    disabled = false,
  } = opts;

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (disabled || typeof window === 'undefined') return;
    return attachWedgeKeyListener(window, {
      onScan: (value) => onScanRef.current(value),
      maxInterKeyMs,
      idleFlushMs,
      minLength,
    });
  }, [disabled, idleFlushMs, maxInterKeyMs, minLength]);
}
