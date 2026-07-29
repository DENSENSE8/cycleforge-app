'use client';

import type { ComponentType, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/_cn';
import { framerVariants } from '@/design-system/foundations/motion-framer';
import { MONITOR_SECTION_CARD_PADDED } from './shell';

export type MonitorSectionCardProps = {
  /** Optional DOM id (e.g. `ops-analytics-throughput` for jump-to anchors). */
  htmlId?: string;
  icon?: ComponentType<{ className?: string }>;
  eyebrow?: string;
  title?: string;
  /** Large number in the header's right slot. */
  headline?: ReactNode;
  /** Small meta under the headline. */
  meta?: ReactNode;
  children?: ReactNode;
  className?: string;
  /**
   * When true, wraps as `motion.section` with `monitorStaggerItem` variants.
   * Parent must use `framerVariants.monitorStaggerContainer`.
   */
  stagger?: boolean;
  /** Extra header actions (right side when no headline). */
  actions?: ReactNode;
};

/**
 * Monitor section shell: eyebrow + optional icon + title + optional headline/meta + body.
 *
 * Use for rollup charts, distribution panels, and leaderboards. List **rows**
 * inside the body use house one-row anatomy (`divide-y`) — never nested SectionCards.
 */
export function SectionCard({
  htmlId,
  icon: Icon,
  eyebrow,
  title,
  headline,
  meta,
  children,
  className,
  stagger = false,
  actions,
}: MonitorSectionCardProps) {
  const hasHeader = Boolean(Icon || eyebrow || title || headline || meta || actions);
  const shellClass = cn(MONITOR_SECTION_CARD_PADDED, 'scroll-mt-6', className);

  const body = (
    <>
      {hasHeader ? (
        <div className={cn('flex items-start justify-between gap-3', children != null && 'mb-4')}>
          <div className="flex min-w-0 items-center gap-2">
            {Icon ? <Icon className="h-4 w-4 shrink-0 text-text-faint" /> : null}
            {(eyebrow || title) && (
              <div className="min-w-0">
                {eyebrow ? (
                  <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{eyebrow}</p>
                ) : null}
                {title ? (
                  <h2 className="text-base font-semibold tracking-tight text-text-default leading-tight">{title}</h2>
                ) : null}
              </div>
            )}
          </div>
          {(headline != null || meta != null || actions != null) && (
            <div className="shrink-0 text-right">
              {actions}
              {headline != null ? (
                <p className="text-2xl font-semibold tabular-nums leading-none text-text-default">{headline}</p>
              ) : null}
              {meta != null ? (
                <p className="mt-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">{meta}</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
      {children}
    </>
  );

  if (stagger) {
    return (
      <motion.section id={htmlId} variants={framerVariants.monitorStaggerItem} className={shellClass}>
        {body}
      </motion.section>
    );
  }

  return (
    <section id={htmlId} className={shellClass}>
      {body}
    </section>
  );
}
