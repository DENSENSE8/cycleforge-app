'use client';

/**
 * Station scan-band glow host — Framer opacity layer over a white base.
 *
 * - Idle: whisper opacity (`scanBandGlowOpacity.idle`)
 * - Focus / click into the band: animate to full (`focused`)
 * - Submit (form submit capture): pulse flash then settle focused
 * - Outcome flash (`cf:scan-band-flash`): emerald success / rose reject overlay
 *   for ~800ms — primary visual channel once scan lines are a flat data floor
 *
 * Catalog: `framerTransition.scanBandGlow` / `scanBandGlowPulse` +
 * `scanBandGlowOpacity`. Reduced motion via `useMotionTransition`.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
} from '@/design-system/motion';
import {
  framerTransition,
  scanBandGlowOpacity,
} from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { scanBandGlowGradientClass } from '@/components/sidebar/receiving/useScanBandHalo';
import { appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
import type { StationTheme } from '@/hooks/useStationTheme';
import {
  SCAN_BAND_FLASH_EVENT,
  type ScanBandFlashDetail,
  type ScanVisualKind,
} from '@/lib/scan-feedback/visual';
import { cn } from '@/utils/_cn';

/** Scan feedback auto-reset window (~800ms). */
const OUTCOME_FLASH_MS = 800;

const OUTCOME_FLASH_CLASS: Record<ScanVisualKind, string> = {
  success: 'bg-emerald-400/35',
  reject: 'bg-rose-400/35',
};

interface ScanBandGlowHostProps {
  themeColor: StationTheme;
  children: ReactNode;
  className?: string;
}

export function ScanBandGlowHost({
  themeColor,
  children,
  className,
}: ScanBandGlowHostProps) {
  const [focused, setFocused] = useState(false);
  const [outcomeFlash, setOutcomeFlash] = useState<ScanVisualKind | null>(null);
  const focusedRef = useRef(false);
  const pulsingRef = useRef(false);
  const controls = useAnimationControls();
  const shouldReduce = useReducedMotion();
  const glowTransition = useMotionTransition(framerTransition.scanBandGlow);
  const pulseTransition = useMotionTransition(framerTransition.scanBandGlowPulse);

  focusedRef.current = focused;

  const settleOpacity = useCallback(
    (nextFocused: boolean) =>
      nextFocused ? scanBandGlowOpacity.focused : scanBandGlowOpacity.idle,
    [],
  );

  useEffect(() => {
    if (pulsingRef.current) return;
    void controls.start({
      opacity: settleOpacity(focused),
      transition: glowTransition,
    });
  }, [focused, controls, glowTransition, settleOpacity]);

  // Outcome flash from {@link playScanFeedback} / {@link flashScanBand}.
  useEffect(() => {
    const onFlash = (event: Event) => {
      const detail = (event as CustomEvent<ScanBandFlashDetail>).detail;
      if (detail?.kind !== 'success' && detail?.kind !== 'reject') return;
      setOutcomeFlash(detail.kind);
    };
    window.addEventListener(SCAN_BAND_FLASH_EVENT, onFlash);
    return () => window.removeEventListener(SCAN_BAND_FLASH_EVENT, onFlash);
  }, []);

  useEffect(() => {
    if (!outcomeFlash) return;
    const timer = window.setTimeout(() => setOutcomeFlash(null), OUTCOME_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [outcomeFlash]);

  const handleFocusCapture = useCallback(() => {
    setFocused(true);
  }, []);

  const handleBlurCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setFocused(false);
  }, []);

  const handlePointerDownCapture = useCallback(() => {
    setFocused(true);
  }, []);

  const handleSubmitCapture = useCallback(() => {
    if (shouldReduce) {
      void controls.set({ opacity: scanBandGlowOpacity.focused });
      setFocused(true);
      return;
    }
    pulsingRef.current = true;
    const keyframes = focusedRef.current
      ? [
          scanBandGlowOpacity.focused,
          scanBandGlowOpacity.pulseDip,
          scanBandGlowOpacity.focused,
        ]
      : [
          scanBandGlowOpacity.idle,
          scanBandGlowOpacity.focused,
          scanBandGlowOpacity.focused,
        ];
    void controls
      .start({
        opacity: keyframes,
        transition: pulseTransition,
      })
      .then(() => {
        pulsingRef.current = false;
        setFocused(true);
      });
  }, [controls, pulseTransition, shouldReduce]);

  return (
    <div
      // Chrome fill defaults to the shared SoT (`appSurfaceFillClass('chrome')`,
      // theme-correct — the old hardcoded paper-white fill stayed white even under a
      // dark theme). Listed before `className` so a caller's own tone (all
      // current callers pass `receivingScanBandClass`, which resolves to the
      // same fill) still wins the `cn()` merge.
      className={cn('relative isolate overflow-hidden', appSurfaceFillClass('chrome'), className)}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
      onPointerDownCapture={handlePointerDownCapture}
      onSubmitCapture={handleSubmitCapture}
    >
      <motion.div
        aria-hidden
        initial={false}
        animate={controls}
        className={cn(
          'pointer-events-none absolute inset-0 -z-10',
          scanBandGlowGradientClass(themeColor),
        )}
        style={{ opacity: scanBandGlowOpacity.idle }}
      />
      <AnimatePresence>
        {outcomeFlash ? (
          <motion.div
            key={outcomeFlash}
            aria-hidden
            initial={{ opacity: shouldReduce ? 0.55 : 0 }}
            animate={{ opacity: shouldReduce ? 0.55 : [0, 0.9, 0] }}
            exit={{ opacity: 0 }}
            transition={
              shouldReduce
                ? { duration: 0 }
                : { duration: OUTCOME_FLASH_MS / 1000, times: [0, 0.2, 1], ease: 'easeOut' }
            }
            className={cn(
              'pointer-events-none absolute inset-0 z-0',
              OUTCOME_FLASH_CLASS[outcomeFlash],
            )}
          />
        ) : null}
      </AnimatePresence>
      {children}
    </div>
  );
}
