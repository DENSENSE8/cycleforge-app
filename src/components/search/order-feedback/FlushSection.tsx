'use client';

/**
 * FlushSection — flush section host for search order feedback.
 * Hairline header only — no outer card border / radius wrapper.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';

export function FlushSection({
  title,
  children,
  className,
  bodyClassName,
  'data-testid': testId,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  'data-testid'?: string;
}) {
  return (
    <section data-testid={testId} className={cn('bg-surface-card', className)}>
      <header className="border-b border-border-hairline px-3 py-2">
        <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
          {title}
        </h3>
      </header>
      <div className={cn('px-3 py-3', bodyClassName)}>{children}</div>
    </section>
  );
}
