'use client';

/**
 * Full-bleed save acknowledgement flash on a dense ledger row.
 *
 * No border radii, no padded cards — success is a fluid success-wash over the
 * hairline row. Theme-aware via `bg-fill-success/10` (never a hardcoded green).
 *
 * Physics: `fadeInstant` on the wash opacity.
 */

import { cn } from '@/utils/_cn';

import { motion } from './framer';
import { fadeInstant } from './tokens';

export function ActionFlashRow({
  isSaved,
  children,
  className,
}: {
  isSaved: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative w-full border-b border-border-hairline', className)}>
      <motion.div
        aria-hidden
        initial={false}
        animate={{ opacity: isSaved ? 1 : 0 }}
        transition={fadeInstant}
        className="pointer-events-none absolute inset-0 bg-fill-success/10"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
