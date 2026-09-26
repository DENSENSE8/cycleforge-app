'use client';

/** Make a find field decode a scan — the mount adapter. */

import { useEffect, useRef, type RefObject } from 'react';
import type { ScanRoute } from '@/lib/barcode-routing';
import {
  FIND_FIELD_BURST_IDLE,
  appendFindFieldKey,
  resolveFindFieldScan,
  type FindFieldBurst,
} from '@/lib/keyboard/find-field-scan';
import { yieldToInput } from '@/lib/perf/yield-to-input';

export function useFindFieldScan(
  inputRef: RefObject<HTMLInputElement | null>,
  opts: {
    /** A printed handle landed in this field. Return true if you consumed it. */
    onHandle: (route: ScanRoute, raw: string) => boolean | void;
    enabled?: boolean;
  },
): void {
  const { onHandle, enabled = true } = opts;
  // Held in a ref so the listener binds ONCE per element — rebinding per
  // keystroke would drop the burst it is trying to measure.
  const handleRef = useRef(onHandle);
  handleRef.current = onHandle;

  useEffect(() => {
    const el = inputRef.current;
    if (!el || !enabled) return undefined;

    let burst: FindFieldBurst = FIND_FIELD_BURST_IDLE;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.metaKey || event.ctrlKey) {
        burst = FIND_FIELD_BURST_IDLE;
        return;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        const scan = resolveFindFieldScan(burst);
        burst = FIND_FIELD_BURST_IDLE;
        if (scan.kind !== 'handle') return; // a typed query — the field's own Enter
        // Claim it: the operator scanned a label, they did not search for its text.
        event.preventDefault();
        event.stopPropagation();
        const { route, raw } = scan;
        void yieldToInput().then(() => {
          const consumed = handleRef.current(route, raw);
          // Clear only when the caller took it, or the label text sits in the
          // filter having done nothing.
          if (consumed !== false && inputRef.current) {
            inputRef.current.value = '';
          }
        });
        return;
      }

      burst = appendFindFieldKey(burst, event.key, event.timeStamp || performance.now());
    };

    el.addEventListener('keydown', onKeyDown, true);
    return () => {
      el.removeEventListener('keydown', onKeyDown, true);
    };
  }, [inputRef, enabled]);
}
