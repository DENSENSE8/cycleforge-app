'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motionBezier } from '@/design-system/foundations/motion-framer';
import { MOBILE_GUTTER, MOBILE_GUTTER_X } from '@/components/mobile/redesign/DesignSystem';

/**
 * Shared chrome for a {@link CaptureStack} row — the collapsed one-line pill vs.
 * the bottom-pinned expanded card, the tap overlay, and the one-shot "fresh
 * arrival" ring pulse. Domain rows render only their *content* as children; the
 * card owns the layout, borders, and animation.
 *
 * Promoted verbatim from `components/mobile/feed/MobileRowCard` in
 * capture-stack Phase 1 (itself extracted from the byte-identical wrappers in
 * MobileReceivingRow / MobilePackingRow).
 *
 * The `MOBILE_GUTTER*` import is deliberate and stays until the stack has a
 * desktop consumer: those two classes are the mobile row-alignment SoT and are
 * shared with `MobileReceivingCards`, so inlining them here would fork the
 * value. Promoting them to a DS spacing token is capture-stack Phase 2 work.
 */
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
          ? `${MOBILE_GUTTER_X} mb-3 mt-2 rounded-2xl border border-blue-100 bg-surface-card p-4 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]`
          : `flex w-full max-w-full flex-col border-b border-border-hairline bg-surface-card ${MOBILE_GUTTER} py-3 transition-colors active:bg-blue-50`
      }`}
    >
      {/* Tap target for the row sheet / action. ds-raw-button: full-bleed row tap target, not a Button shape */}
      {onTap && (
        <button
          type="button"
          onClick={onTap}
          className="ds-raw-button absolute inset-0 z-0 h-full w-full active:bg-blue-50/30"
          aria-label="Open"
        />
      )}

      {/* Fresh-arrival ring pulse (expanded row only). */}
      {isExpanded && fresh && !reduceMotion && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0.55, scale: 1 }}
          animate={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 1.8, ease: motionBezier.easeOut }}
          className="pointer-events-none absolute inset-0 z-0 rounded-2xl ring-2 ring-blue-400/70"
        />
      )}

      {/* Content layer — clicks fall through to the tap target unless a child
          opts back in with pointer-events-auto (chips, links). */}
      <div className="relative z-10 pointer-events-none flex min-w-0 max-w-full flex-col overflow-x-hidden">{children}</div>
    </div>
  );
}
