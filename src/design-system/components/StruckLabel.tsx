'use client';

/**
 * The STRUCK label face — text whose work is done.
 * ease-in-out in BOTH directions (operator ruling 2026-09-14) instead of
 */

import type { ReactNode } from 'react';
import { motion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';

/** Ease in, ease out — both directions of the strike (operator ruling). */
const STRIKE_TRANSITION = { duration: 0.28, ease: 'easeInOut' } as const;

export function StruckLabel({
  struck,
  children,
}: {
  struck: boolean;
  children: ReactNode;
}) {
  return (
    <motion.span
      data-struck={struck ? 'true' : 'false'}
      className={cn(
        'inline-block min-w-0 max-w-full align-middle transition-colors duration-200 [text-decoration-line:line-through]',
        struck ? 'text-text-muted' : 'decoration-transparent',
      )}
      initial={false}
      animate={{ textDecorationThickness: struck ? '1px' : '0px' }}
      transition={STRIKE_TRANSITION}
    >
      {children}
    </motion.span>
  );
}
