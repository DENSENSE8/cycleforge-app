'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { motion } from '@/design-system/motion';
import confetti from 'canvas-confetti';
import { Check } from '@/components/Icons';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';

const ICON_SPRING = { type: 'spring' as const, stiffness: 500, damping: 24, mass: 0.6 };

interface IntegrationConnectSuccessProps {
  message: string;
  /** Brief celebratory burst — default true for OAuth returns. */
  confettiBurst?: boolean;
  /** Optional next-step link (e.g. Incoming after buyer eBay connect). */
  href?: string;
  linkLabel?: string;
}

/** Animated success checkmark for provider connect outcomes. */
export function IntegrationConnectSuccess({
  message,
  confettiBurst = true,
  href,
  linkLabel,
}: IntegrationConnectSuccessProps) {
  const transition = useMotionTransition(motionTransition.cardExpansion);

  useEffect(() => {
    if (!confettiBurst) return;
    confetti({
      particleCount: 60,
      spread: 55,
      origin: { y: 0.72 },
      colors: ['#10b981', '#34d399', '#6ee7b7', '#3b82f6'],
      disableForReducedMotion: true,
    });
  }, [confettiBurst]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={transition}
      className="flex items-start gap-3 overflow-hidden rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-emerald-800 shadow-sm shadow-emerald-900/[0.04]"
      role="status"
      aria-live="polite"
    >
      <motion.span
        initial={{ scale: 0, rotate: -120 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={ICON_SPRING}
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-600/30"
      >
        <Check className="h-4 w-4" />
      </motion.span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-role-caption font-semibold text-emerald-700">Connected</p>
        <p className="mt-0.5 text-role-body font-medium text-emerald-900">{message}</p>
        {href && linkLabel ? (
          <Link
            href={href}
            className="mt-1.5 inline-block text-role-caption font-semibold text-emerald-800 underline decoration-emerald-600/40 underline-offset-2 hover:text-emerald-950"
          >
            {linkLabel}
          </Link>
        ) : null}
      </div>
    </motion.div>
  );
}
