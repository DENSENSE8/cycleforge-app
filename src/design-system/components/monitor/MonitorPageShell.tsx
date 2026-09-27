'use client';

import type { ReactNode } from 'react';
import { motion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import { motionVariants } from '@/design-system/foundations/motion-presets';

export type MonitorPageShellProps = {
  children: ReactNode;
  className?: string;
  /** Inner max-width container class; default matches Operations analytics. */
  contentClassName?: string;
  /**
   * First-load stagger of child sections that use `stagger` on SectionCard / KpiStrip.
   * Do **not** remount this on filter keystrokes — keep filters as URL params and
   * re-render in place (no crossfade).
   */
  stagger?: boolean;
};

/**
 * Full-height Monitor scroll shell: canvas background + padded max-width column.
 */
export function MonitorPageShell({
  children,
  className,
  contentClassName,
  stagger = false,
}: MonitorPageShellProps) {
  const content = cn(
    'flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16 space-y-6',
    contentClassName,
  );

  return (
    <div
      className={cn(
        'flex-1 flex flex-col min-w-0 h-full overflow-y-auto bg-surface-canvas text-text-default',
        className,
      )}
    >
      {stagger ? (
        <motion.main
          variants={motionVariants.monitorStaggerContainer}
          initial="hidden"
          animate="visible"
          className={content}
        >
          {children}
        </motion.main>
      ) : (
        <main className={content}>{children}</main>
      )}
    </div>
  );
}
