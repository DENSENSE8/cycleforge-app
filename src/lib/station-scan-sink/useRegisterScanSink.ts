'use client';

import { useEffect, useRef } from 'react';
import {
  registerScanSink,
  type ScanSinkHandler,
  type ScanSinkRegistration,
} from './store';

/**
 * Register an Action-plane scan sink while mounted / enabled. The handler
 * and optional focus callback stay identity-stable via refs so the Map
 * always sees the freshest closure without re-register churn every render.
 */
export function useRegisterScanSink(args: {
  id: string;
  enabled?: boolean;
  onScan: ScanSinkHandler;
  focus?: () => void;
}): void {
  const { id, enabled = true, onScan, focus } = args;
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const focusRef = useRef(focus);
  focusRef.current = focus;

  useEffect(() => {
    if (!enabled || !id) return;
    const registration: ScanSinkRegistration = {
      id,
      onScan: (value) => onScanRef.current(value),
      focus: focusRef.current
        ? () => {
            focusRef.current?.();
          }
        : undefined,
    };
    return registerScanSink(registration);
  }, [id, enabled]);
}
