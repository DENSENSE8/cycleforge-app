'use client';

/**
 * Station scan-band glow host — Framer opacity layer over a white base.
 *
 * - Idle: whisper opacity (`scanBandGlowOpacity.idle`)
 * - Focus / click into the band: animate to full (`focused`)
 * - Submit (form submit capture): pulse flash then settle focused
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
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import {
  framerTransition,
  scanBandGlowOpacity,
} from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { scanBandGlowGradientClass } from '@/components/sidebar/receiving/useScanBandHalo';
import type { StationTheme } from '@/hooks/useStationTheme';
import { cn } from '@/utils/_cn';

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
      className={cn(className, 'relative isolate overflow-hidden bg-white')}
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
      {children}
    </div>
  );
}
