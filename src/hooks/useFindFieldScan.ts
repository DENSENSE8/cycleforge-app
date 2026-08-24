'use client';

/**
 * Wedge detection INSIDE a text field — the DOM adapter over
 * `src/lib/keyboard/find-field-scan.ts` (the pure half), plus the paste stamp.
 * This is the missing piece that module's docblock has referenced since it
 * landed, and the first item of HANDOFF-ai-first Phase 1: every scan, paste
 * and keystroke that reaches the field resolves to one `{ value, source }`.
 *
 * ## The contract (asserted by the mounted DOM tests beside this file)
 *
 * - **Native capture, never a React synthetic handler.** A wedge burst must
 *   not enter a fiber per character — the same law `createWedgeKeyListener`
 *   obeys. Capture also means a claimed terminator can be stopped before the
 *   field's own React `onKeyDown` (the composer's Enter-sends) ever sees it.
 * - **Characters are never prevented.** Live filtering keeps working and a
 *   human's typing is untouched. The single `preventDefault()` in this file
 *   sits behind the decoded-handle branch, on Enter alone.
 * - **A human can never reach the claim.** Human-speed gaps reset the burst
 *   every keystroke (`appendFindFieldKey` mirrors `wedgeReduce`), so the run
 *   stays 1 char and fails the wedge minimum.
 * - **Side effects run OFF the keydown stack** via `yieldToInput()` — a wedge
 *   fires its next keydown within ~8–20ms, and React work on the keydown
 *   stack is how INP goes red.
 * - **Paste short-circuits the machine.** A paste is a ClipboardEvent with
 *   zero per-character keydowns; it resets the burst (pasted text never
 *   accumulates toward a claim) and is stamped `source: 'paste'` — a human
 *   moved data in; it is treated as typed, never as a scan. There is no chord
 *   sniffing: Ctrl+V, Shift+Insert, middle-click, context-menu paste and the
 *   touch callout all converge on the same `paste` event.
 *
 * The claimed burst's characters were typed into the field (never prevented),
 * so the CALLER owns removing them — a controlled React field strips the
 * suffix from its own state rather than this adapter fighting the renderer.
 */

import { useCallback, useRef } from 'react';
import type { ScanRoute } from '@/lib/barcode-routing';
import {
  FIND_FIELD_BURST_IDLE,
  appendFindFieldKey,
  resolveFindFieldScan,
  type FindFieldSource,
} from '@/lib/keyboard/find-field-scan';
import { yieldToInput } from '@/lib/perf/yield-to-input';

export type { FindFieldSource };

/** A machine-fast burst that decoded to a printed handle. The field yields. */
export interface FindFieldScanClaim {
  readonly value: string;
  readonly route: ScanRoute;
  readonly source: 'scanner';
}

/** A paste, stamped. Never claimed — the text lands in the field as typed. */
export interface FindFieldPasteStamp {
  readonly value: string;
  readonly source: 'paste';
}

export interface UseFindFieldScanOptions {
  /** A decoded burst was claimed; the terminator Enter was stopped. */
  onScan: (claim: FindFieldScanClaim) => void;
  /** A paste landed in the field. Informational — nothing was prevented. */
  onPaste?: (paste: FindFieldPasteStamp) => void;
}

/**
 * Attach field-scoped wedge + paste detection to one input, textarea, or
 * contenteditable (the Omni-Command Composer). Returns a ref callback; attach
 * it to the element. Human typing needs no
 * handler here — anything unclaimed is the field's own behaviour, which is
 * what makes the third `source` value structural rather than inferred.
 */
export function useFindFieldScan({ onScan, onPaste }: UseFindFieldScanOptions) {
  const burst = useRef(FIND_FIELD_BURST_IDLE);
  // Latest-callback refs so the ref callback below can stay stable across
  // renders — re-running it would tear down and re-add the listeners.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onPasteRef = useRef(onPaste);
  onPasteRef.current = onPaste;
  const detach = useRef<(() => void) | null>(null);

  return useCallback((el: HTMLElement | null) => {
    detach.current?.();
    detach.current = null;
    if (!el) return;

    // Takes `Event`: the input|textarea UNION collapses addEventListener to
    // its untyped overload, so the narrowing happens here instead.
    const onKeyDown = (raw: Event) => {
      const event = raw as KeyboardEvent;
      // A chord is never part of a burst — mirrors `wedgeReduce`'s first arm.
      // (Ctrl+V's `v` lands here too, so even the keystroke half of a paste
      // chord cannot accumulate.)
      if (event.altKey || event.metaKey || event.ctrlKey) {
        burst.current = FIND_FIELD_BURST_IDLE;
        return;
      }
      // Enter AND Tab — the wedge machine's own terminator set (guns are
      // configured either way). An UNCLAIMED Tab passes untouched, so focus
      // navigation is unaffected for humans, who cannot reach the claim.
      if (event.key === 'Enter' || event.key === 'Tab') {
        const scan = resolveFindFieldScan(burst.current);
        burst.current = FIND_FIELD_BURST_IDLE;
        if (scan.kind !== 'handle') return;
        // The one prevention in this file: a claimed terminator. Stopping
        // propagation keeps the field's own Enter behaviour (submit, send)
        // from also firing on a value that was never text for the field.
        event.preventDefault();
        event.stopPropagation();
        void yieldToInput().then(() =>
          onScanRef.current({ value: scan.raw, route: scan.route, source: 'scanner' }),
        );
        return;
      }
      // `timeStamp || performance.now()`: some synthetic dispatch paths stamp
      // 0, and 0 is the burst's "no previous key" sentinel — a zero-stamped
      // run would read as one endless first keystroke.
      burst.current = appendFindFieldKey(burst.current, event.key, event.timeStamp || performance.now());
    };

    const handlePaste = (event: Event) => {
      // Short-circuit: whatever the machine had accumulated, a paste ends it.
      burst.current = FIND_FIELD_BURST_IDLE;
      const value = (event as ClipboardEvent).clipboardData?.getData('text') ?? '';
      const stamp = onPasteRef.current;
      if (!value || !stamp) return;
      void yieldToInput().then(() => stamp({ value, source: 'paste' }));
    };

    el.addEventListener('keydown', onKeyDown, true);
    el.addEventListener('paste', handlePaste);
    detach.current = () => {
      el.removeEventListener('keydown', onKeyDown, true);
      el.removeEventListener('paste', handlePaste);
    };
  }, []);
}
