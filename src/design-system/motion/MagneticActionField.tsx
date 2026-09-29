'use client';

import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useTransform } from './react';
import { useMagneticPull } from './plus';
import { usePointerFine } from './use-pointer-fine';

export function clampMagneticOffset(value: number, maximum: number): number {
  const limit = Math.max(0, maximum);
  return Math.max(-limit, Math.min(limit, value));
}

export function magneticActionEnabled({
  finePointer,
  reducedMotion,
  disabled,
}: {
  finePointer: boolean;
  reducedMotion: boolean;
  disabled: boolean;
}): boolean {
  return finePointer && !reducedMotion && !disabled;
}

interface MagneticActionFieldProps {
  children: ReactNode;
  fieldClassName?: string;
  contentClassName?: string;
  /** Share of pointer displacement applied to the content. */
  pull?: number;
  /** Hard spatial cap; the clickable face never drifts beyond its field. */
  maxOffset?: number;
  disabled?: boolean;
  testId?: string;
}

/**
 * Motion+ magnetic pull with CycleForge policy: fine pointers only, capped,
 * and completely suppressed for reduced motion or disabled interactions.
 */
export function MagneticActionField({
  children,
  fieldClassName,
  contentClassName,
  pull = 0.2,
  maxOffset = 18,
  disabled = false,
  testId,
}: MagneticActionFieldProps) {
  const finePointer = usePointerFine();
  const reducedMotion = useReducedMotion() ?? false;
  const enabled = magneticActionEnabled({ finePointer, reducedMotion, disabled });
  const fieldRef = useRef<HTMLDivElement>(null);
  const raw = useMagneticPull(fieldRef, pull);
  const x = useTransform(raw.x, (value) => clampMagneticOffset(value, maxOffset));
  const y = useTransform(raw.y, (value) => clampMagneticOffset(value, maxOffset));

  return (
    <div
      ref={fieldRef}
      className={fieldClassName}
      data-magnetic-enabled={enabled ? 'true' : 'false'}
      data-testid={testId}
    >
      <motion.div className={contentClassName} style={enabled ? { x, y } : { x: 0, y: 0 }}>
        {children}
      </motion.div>
    </div>
  );
}
