'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { MOBILE_V2_GUTTER, MOBILE_V2_GUTTER_X } from '@/components/mobile/v2/MobileV2Layout';

/** Shared chrome for a {@link CaptureStack} row — the collapsed one-line record vs. */
export function CaptureStackRow({
  variant,
  fresh = false,
  onTap,
  children,
  dataAttr,
}: {
  variant: 'collapsed' | 'expanded';
  fresh?: boolean;
  onTap?: () => void;
  children: ReactNode;
  /** Optional data-* attribute pair for e2e / debugging hooks. */
  dataAttr?: { name: string; value: string | number };
}) {
  const reduceMotion = useReducedMotion();
  const isExpanded = variant === 'expanded';

  const dataProps = dataAttr ? { [`data-${dataAttr.name}`]: dataAttr.value } : {};

  return (
    <div
      {...dataProps}
      className={`relative max-w-full overflow-x-hidden transition-all ${
        isExpanded
          ? `${MOBILE_V2_GUTTER_X} mb-3 mt-2 border border-border-emphasis bg-surface-card p-4`
          : `flex w-full max-w-full flex-col border-b border-border-hairline bg-surface-card ${MOBILE_V2_GUTTER} py-3 transition-colors active:bg-surface-sunken`
      }`}
    >
      {/* Tap target for the row sheet / action. ds-raw-button: full-bleed row tap target, not a Button shape */}
      {onTap && (
        <button
          type="button"
          onClick={onTap}
          className="ds-raw-button absolute inset-0 z-0 h-full w-full active:bg-surface-sunken/70"
          aria-label="Open"
        />
      )}

      {/* Fresh-arrival ring pulse (expanded row only). */}
      {isExpanded && fresh && !reduceMotion && (
        <motion.span
          aria-hidden
          initial={motionPresence.captureStackFreshPulse.initial}
          animate={motionPresence.captureStackFreshPulse.animate}
          transition={motionTransition.captureStackFreshPulse}
          className="pointer-events-none absolute inset-0 z-0 rounded-none ring-2 ring-border-accent/70"
        />
      )}

      {/* Content layer — clicks fall through to the tap target unless a child
          opts back in with pointer-events-auto (chips, links). */}
      <div className="relative z-10 pointer-events-none flex min-w-0 max-w-full flex-col overflow-x-hidden">{children}</div>
    </div>
  );
}
